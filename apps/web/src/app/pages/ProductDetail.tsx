import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { MessageCircle } from "lucide-react";
import { Button } from "@360/ui/button";
import { Skeleton } from "@360/ui/skeleton";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { TrustStrip } from "../components/TrustStrip";
import { AvailabilityBadge } from "../components/AvailabilityBadge";
import { ProductCard } from "../components/ProductCard";
import { SectionHeading } from "../components/SectionHeading";
import { getProductById, getRelatedProducts } from "../data/api";
import { type Product } from "../data/products";
import { formatPKR } from "@360/lib/format";
import { whatsappOrderUrl, WHATSAPP_DISPLAY } from "@360/lib/whatsapp";
import { productUrl } from "../lib/site";
import { useDocumentMeta } from "../lib/head";
import { JsonLd } from "../components/JsonLd";
import { productJsonLd } from "../lib/jsonld";

// A product published at 0 (the publish guard only requires price_pkr NOT NULL) rendered a
// large red "Rs 0" and put "• Rs 0" into the prefilled WhatsApp message — a customer would
// reasonably ask for a free part. Treat non-positive as "unpriced" everywhere it is shown.
const hasPrice = (v: number | null | undefined): v is number => typeof v === "number" && v > 0;

export function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [related, setRelated] = useState<Product[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback((productId: string) => {
    setProduct(undefined);
    setLoadError(false);
    setActiveImage(0);
    getProductById(productId)
      .then((p) => setProduct(p ?? null))
      .catch(() => {
        // A rejected request is NOT a missing product. Every order on this site arrives via a
        // forwarded link to this page, so telling a buyer the part "may have been removed"
        // because their mobile connection blipped is the most expensive wrong message we ship.
        setProduct(null);
        setLoadError(true);
      });
    getRelatedProducts(productId).then(setRelated).catch(() => setRelated([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    load(id);
  }, [id, load]);

  // Per-product share image: the product photo when it has one, else the brand card.
  useDocumentMeta(product?.name, product?.metaDescription || product?.shortDescription, product?.images[0]);

  if (product === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Checked BEFORE the not-found branch: "we couldn't reach the server" and "this part does
  // not exist" are different claims and must not share a message.
  if (loadError) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1>Couldn't Load This Part</h1>
        <p className="font-body text-muted-foreground">
          Something went wrong reaching our catalogue — the part is still here. Check your
          connection and try again.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand-hover"
            onClick={() => id && load(id)}
          >
            Try Again
          </Button>
          <Button variant="outline" onClick={() => navigate("/catalogue")}>
            Back to Catalogue
          </Button>
        </div>
      </div>
    );
  }

  if (product === null) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1>Product Not Found</h1>
        <p className="font-body text-muted-foreground">
          The part you're looking for isn't here. It may have been removed.
        </p>
        <Button
          className="bg-brand text-brand-foreground hover:bg-brand-hover"
          onClick={() => navigate("/catalogue")}
        >
          BACK TO CATALOGUE
        </Button>
      </div>
    );
  }

  const soldOut = product.availability === "out-of-stock";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Rich-results structured data — products here are already published + priced.
          The offer URL comes from productUrl() (i.e. VITE_SITE_URL), the same source head.ts
          builds the canonical from; window.location would disagree with it on a preview
          deploy or a www/apex mismatch. */}
      {product.pricePKR > 0 && (
        <JsonLd data={productJsonLd(product, productUrl(product.slug))} />
      )}
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Catalogue", to: "/catalogue" },
          ...(product.categoryName
            ? [{ label: product.categoryName, to: `/catalogue/${product.category}` }]
            : []),
          { label: product.name },
        ]}
      />

      <div className="mt-8 grid gap-10 md:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="overflow-hidden rounded-lg border border-border bg-muted">
            <ImageWithFallback
              src={product.images[activeImage]}
              alt={product.name}
              className="aspect-square w-full object-cover"
            />
          </div>
          {/* Four 80px thumbs plus gaps exceed a 375px viewport, so the strip scrolls. */}
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`View image ${i + 1}`}
                  className={`size-20 overflow-hidden rounded-md border-2 transition-colors ${
                    i === activeImage ? "border-brand" : "border-border hover:border-foreground"
                  }`}
                >
                  <ImageWithFallback
                    src={img}
                    alt={`${product.name} thumbnail ${i + 1}`}
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <span className="font-heading text-sm uppercase tracking-widest text-muted-foreground">
            {product.brand}
          </span>
          <h1 className="mt-1">{product.name}</h1>
          <p className="mt-2 font-body text-sm uppercase tracking-wide text-muted-foreground">SKU {product.sku}</p>

          {/* Wraps: sale price + struck original + availability badge overflow 375px on one line. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {!hasPrice(product.pricePKR) ? (
              <span className="font-heading text-3xl font-bold text-foreground">Price on request</span>
            ) : hasPrice(product.salePricePKR) && product.salePricePKR! < product.pricePKR ? (
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {/* Red is reserved for the sale price. */}
                <span className="font-heading text-3xl font-bold text-brand">{formatPKR(product.salePricePKR)}</span>
                <span className="font-body text-lg text-muted-foreground line-through">{formatPKR(product.pricePKR)}</span>
                <span className="self-center rounded bg-brand/10 px-2 py-0.5 font-heading text-xs font-bold uppercase tracking-wide text-brand">
                  Save {formatPKR(product.pricePKR - product.salePricePKR!)} · {Math.round((1 - product.salePricePKR! / product.pricePKR) * 100)}%
                </span>
              </span>
            ) : (
              <span className="font-heading text-3xl font-bold text-foreground">{formatPKR(product.pricePKR)}</span>
            )}
            <AvailabilityBadge availability={product.availability} count={product.stockQty} />
          </div>

          {product.description && (
            <p className="mt-6 font-body text-foreground/80">{product.description}</p>
          )}

          {/* Order CTA. A sold-out state is a real, focusable <button> — as an hrefless <a> it
              had role="generic", so it left the tab order and its disabled state was never
              announced. */}
          <div className="mt-8 flex flex-col gap-3">
            {soldOut ? (
              <button
                type="button"
                aria-disabled="true"
                aria-label={`${product.name} — sold out`}
                onClick={(e) => e.preventDefault()}
                className="flex h-14 cursor-not-allowed items-center justify-center gap-3 rounded-md bg-muted px-8 font-heading text-base font-bold uppercase tracking-wide text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <MessageCircle className="size-5" aria-hidden />
                Sold Out
              </button>
            ) : (
              <a
                href={whatsappOrderUrl({ ...product, url: productUrl(product.slug) })}
                target="_blank"
                rel="noreferrer"
                aria-label={`Order ${product.name} on WhatsApp`}
                className="flex h-14 items-center justify-center gap-3 rounded-md bg-brand px-8 font-heading text-base font-bold uppercase tracking-wide text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <MessageCircle className="size-5" aria-hidden />
                Order on WhatsApp
              </a>
            )}
            <p className="font-body text-xs text-muted-foreground">
              {product.availability === "made-to-order"
                ? "Made to order — lead time confirmed by our team on WhatsApp before dispatch."
                : product.availability === "low-stock"
                  ? "Low stock — message us to lock yours in before it's gone."
                  : `Tap to message us at ${WHATSAPP_DISPLAY} — we'll confirm price, fitment & delivery.`}
            </p>
          </div>

          {/* Reassurance — shared TrustStrip so delivery/returns/payment read the same everywhere
              and link to the policy that backs them. */}
          <TrustStrip cols={2} className="mt-8" />

          {/* Specs — hidden when empty; the heading over a 2px hairline box read as broken. */}
          {product.specs.length > 0 && (
          <div className="mt-8">
            {/* h2, not h3: the outline was h1 (name) -> h3 (specs) -> h2 (related), skipping a
                level. text-xl keeps the original h3 size. */}
            <h2 className="mb-3 text-xl">Specifications</h2>
            <dl className="overflow-hidden rounded-lg border border-border">
              {product.specs.map((spec, i) => (
                <div
                  key={`${spec.label}-${i}`}
                  className={`flex justify-between gap-4 px-4 py-3 ${
                    i % 2 === 0 ? "bg-muted/40" : "bg-card"
                  }`}
                >
                  <dt className="font-body text-sm text-muted-foreground">{spec.label}</dt>
                  <dd className="text-right font-body text-sm font-medium text-foreground">
                    {spec.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          )}
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-20">
          <SectionHeading eyebrow="You Might Also Need" title="Related Products" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button asChild variant="outline" className="h-11 px-8">
              <Link to="/catalogue">VIEW FULL CATALOGUE</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
