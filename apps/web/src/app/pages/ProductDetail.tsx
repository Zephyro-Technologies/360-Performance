import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { MessageCircle, Truck, ShieldCheck, RotateCcw } from "lucide-react";
import { Button } from "@360/ui/button";
import { Skeleton } from "@360/ui/skeleton";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { Breadcrumbs } from "../components/Breadcrumbs";
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

export function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [related, setRelated] = useState<Product[]>([]);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (!id) return;
    setProduct(undefined);
    setActiveImage(0);
    getProductById(id).then((p) => setProduct(p ?? null)).catch(() => setProduct(null));
    getRelatedProducts(id).then(setRelated).catch(() => setRelated([]));
  }, [id]);

  // Per-product share image: the product photo when it has one, else the brand card.
  useDocumentMeta(product?.name, product?.metaDescription || product?.shortDescription, product?.images[0]);

  if (product === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
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
            ? [{ label: product.categoryName, to: `/catalogue?category=${product.category}` }]
            : []),
          { label: product.name },
        ]}
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="overflow-hidden rounded-lg border border-border bg-muted">
            <ImageWithFallback
              src={product.images[activeImage]}
              alt={product.name}
              className="aspect-square w-full object-cover"
            />
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-3">
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

          <div className="mt-4 flex items-center gap-4">
            {product.salePricePKR != null && product.salePricePKR < product.pricePKR ? (
              <span className="flex items-baseline gap-2">
                <span className="font-heading text-3xl font-bold text-brand">{formatPKR(product.salePricePKR)}</span>
                <span className="font-body text-lg text-muted-foreground line-through">{formatPKR(product.pricePKR)}</span>
              </span>
            ) : (
              <span className="font-heading text-3xl font-bold text-brand">{formatPKR(product.pricePKR)}</span>
            )}
            <AvailabilityBadge availability={product.availability} count={product.stockQty} />
          </div>

          <p className="mt-6 font-body text-foreground/80">{product.description}</p>

          {/* Order CTA */}
          <div className="mt-8 flex flex-col gap-3">
            <a
              href={soldOut ? undefined : whatsappOrderUrl({ ...product, url: productUrl(product.slug) })}
              target="_blank"
              rel="noreferrer"
              aria-disabled={soldOut}
              onClick={(e) => {
                if (soldOut) e.preventDefault();
              }}
              className={`flex h-14 items-center justify-center gap-3 rounded-md px-8 font-heading text-base font-bold uppercase tracking-wide transition-colors ${
                soldOut
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-brand text-white hover:bg-brand-hover"
              }`}
            >
              <MessageCircle className="size-5" />
              {soldOut ? "Out of Stock" : "Order on WhatsApp"}
            </a>
            <p className="font-body text-xs text-muted-foreground">
              {product.availability === "made-to-order"
                ? "Made to order — lead time confirmed by our team on WhatsApp before dispatch."
                : product.availability === "low-stock"
                  ? "Low stock — message us to lock yours in before it's gone."
                  : `Tap to message us at ${WHATSAPP_DISPLAY} — we'll confirm price, fitment & delivery.`}
            </p>
          </div>

          {/* Reassurance */}
          <div className="mt-8 grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-3">
            {[
              { icon: Truck, text: "Nationwide delivery" },
              { icon: ShieldCheck, text: "Genuine part" },
              { icon: RotateCcw, text: "Backed by our return policy" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-2">
                <f.icon className="size-5 text-brand" />
                <span className="font-body text-sm text-foreground">{f.text}</span>
              </div>
            ))}
          </div>

          {/* Specs */}
          <div className="mt-8">
            <h3 className="mb-3">Specifications</h3>
            <dl className="overflow-hidden rounded-lg border border-border">
              {product.specs.map((spec, i) => (
                <div
                  key={spec.label}
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
