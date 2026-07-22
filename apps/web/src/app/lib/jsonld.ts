import type { Product } from "../data/products";

// schema.org availability mapping for the storefront's availability values.
const AVAIL_SCHEMA: Record<string, string> = {
  "in-stock": "https://schema.org/InStock",
  "low-stock": "https://schema.org/LimitedAvailability",
  "made-to-order": "https://schema.org/MadeToOrder",
  "out-of-stock": "https://schema.org/OutOfStock",
};

// Grounded Offer enrichment shared with the build-time prerender (scripts/prerender.mjs must
// stay in step with this). Every value is real: prices are new genuine parts (NewCondition), the
// returns window is the 7 days stated in the returns policy, the seller is us. priceValidUntil is
// the conventional far-future date that silences Search Console's "no expiry" warning. Shipping
// rate is deliberately omitted — it is negotiated per order on WhatsApp, so any figure would be
// invented.
export function offerExtras(): Record<string, unknown> {
  const priceValidUntil = `${new Date().getFullYear() + 1}-12-31`;
  return {
    itemCondition: "https://schema.org/NewCondition",
    priceValidUntil,
    seller: { "@type": "Organization", name: "360 Performance" },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "PK",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
    },
  };
}

// schema.org Product + Offer for a PUBLISHED + PRICED product (rich results).
// Only call this for products that reached the storefront (products_public already
// filters to published+visible, and the publish guard requires a price).
export function productJsonLd(product: Product, url: string): Record<string, unknown> {
  const onSale = product.salePricePKR != null && product.salePricePKR < product.pricePKR;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    offers: {
      "@type": "Offer",
      priceCurrency: "PKR",
      price: onSale ? product.salePricePKR : product.pricePKR,
      availability: AVAIL_SCHEMA[product.availability] ?? "https://schema.org/InStock",
      url,
      ...offerExtras(),
    },
  };
  const description = product.metaDescription || product.shortDescription || product.description;
  if (description) data.description = description;
  if (product.images.length) data.image = product.images;
  if (product.brand) data.brand = { "@type": "Brand", name: product.brand };
  if (product.mpn) data.mpn = product.mpn;
  return data;
}

/** schema.org BreadcrumbList from resolved crumbs (each with an absolute url; last = current). */
export function breadcrumbJsonLd(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** schema.org BlogPosting for a post page. */
export function blogPostingJsonLd(input: {
  title: string;
  url: string;
  description?: string;
  image?: string;
  datePublished?: string;
  author?: string;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "BlogPosting",
    headline: input.title,
    mainEntityOfPage: input.url,
    author: { "@type": input.author ? "Person" : "Organization", name: input.author || "360 Performance" },
    publisher: { "@type": "Organization", name: "360 Performance" },
  };
  if (input.description) data.description = input.description;
  if (input.image) data.image = [input.image];
  if (input.datePublished) data.datePublished = input.datePublished;
  return data;
}
