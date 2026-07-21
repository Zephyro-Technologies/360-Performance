import { Link } from "react-router";
import { MessageCircle } from "lucide-react";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { formatPKR } from "@360/lib/format";
import { whatsappOrderUrl } from "@360/lib/whatsapp";
import { productUrl } from "../lib/site";
import { srcSetFor } from "../lib/images";
import type { Product } from "../data/products";

/**
 * ProductCard adapts to its surrounding section:
 * - `tone="dark"` → black bg, white text (homepage featured band)
 * - `tone="light"` (default) → white card with subtle border (catalogue, related)
 */
export function ProductCard({
  product,
  tone = "light",
}: {
  product: Product;
  tone?: "light" | "dark";
}) {
  const soldOut = product.availability === "out-of-stock";
  const dark = tone === "dark";

  return (
    <div
      className={`group flex flex-col overflow-hidden border transition-colors duration-300 ${
        dark
          ? "border-white/10 bg-zinc-950 text-white hover:border-brand"
          : "border-zinc-200 bg-white text-black hover:border-black"
      }`}
    >
      <Link
        to={`/product/${product.slug}`}
        className={`relative block aspect-square overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
          dark ? "bg-black" : "bg-zinc-50"
        }`}
      >
        <ImageWithFallback
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
          decoding="async"
          width={640}
          height={640}
          srcSet={srcSetFor(product.images[0])}
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw"
          className={`size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
            dark ? "opacity-90 group-hover:opacity-100" : ""
          }`}
        />
        <div className="absolute left-3 top-3 z-10">
          <AvailabilityBadge
            availability={product.availability}
            count={product.stockQty}
          />
        </div>
        {product.featured && (
          <span className="absolute right-3 top-3 z-10 bg-brand px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-[0.2em] text-white">
            Featured
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <span
          className={`font-heading text-[10px] font-bold uppercase tracking-[0.3em] ${
            dark ? "text-white/50" : "text-zinc-500"
          }`}
        >
          {product.brand}
        </span>
        <Link
          to={`/product/${product.slug}`}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <h3
            className={`mt-1.5 line-clamp-2 font-heading text-sm font-bold uppercase leading-tight tracking-wide transition-colors group-hover:text-brand ${
              dark ? "text-white" : "text-black"
            }`}
          >
            {product.name}
          </h3>
        </Link>
        <p className={`mt-1 font-body text-[11px] uppercase tracking-wide ${dark ? "text-white/40" : "text-zinc-400"}`}>
          SKU {product.sku}
        </p>

        <div className="mt-3 flex items-center gap-2">
          {/* Non-positive price = unpriced, not free. See whatsappOrderUrl, which omits the
              price line in the same case rather than offering the part at Rs 0. */}
          {!(product.pricePKR > 0) ? (
            <span className={`font-heading font-bold ${dark ? "text-white" : "text-black"}`}>
              Price on request
            </span>
          ) : product.salePricePKR != null && product.salePricePKR > 0 && product.salePricePKR < product.pricePKR ? (
            <>
              <span className="font-heading font-bold text-brand">{formatPKR(product.salePricePKR)}</span>
              <span className={`font-body text-xs line-through ${dark ? "text-white/40" : "text-zinc-400"}`}>
                {formatPKR(product.pricePKR)}
              </span>
            </>
          ) : (
            <span className={`font-heading font-bold ${dark ? "text-white" : "text-black"}`}>
              {formatPKR(product.pricePKR)}
            </span>
          )}
        </div>

        <a
          href={soldOut ? undefined : whatsappOrderUrl({ ...product, url: productUrl(product.slug) })}
          target="_blank"
          rel="noreferrer"
          aria-disabled={soldOut}
          aria-label={
            soldOut
              ? `${product.name} — currently sold out`
              : `Order ${product.name} on WhatsApp`
          }
          onClick={(e) => {
            if (soldOut) e.preventDefault();
          }}
          className={`mt-4 flex items-center justify-center gap-2 px-4 py-2.5 font-heading text-xs font-bold uppercase tracking-[0.2em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
            soldOut
              ? "cursor-not-allowed bg-zinc-200 text-zinc-500"
              : dark
                ? "border border-white/20 text-white hover:border-brand hover:bg-brand"
                : "bg-black text-white hover:bg-brand"
          }`}
        >
          <MessageCircle className="size-3.5" />
          {soldOut ? "Sold Out" : "Order on WhatsApp"}
        </a>
      </div>
    </div>
  );
}
