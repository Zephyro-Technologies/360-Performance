import type { Product } from "../data/products";

// schema.org availability mapping for the storefront's availability values.
const AVAIL_SCHEMA: Record<string, string> = {
  "in-stock": "https://schema.org/InStock",
  "low-stock": "https://schema.org/LimitedAvailability",
  "made-to-order": "https://schema.org/MadeToOrder",
  "out-of-stock": "https://schema.org/OutOfStock",
};

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
    },
  };
  const description = product.metaDescription || product.shortDescription || product.description;
  if (description) data.description = description;
  if (product.images.length) data.image = product.images;
  if (product.brand) data.brand = { "@type": "Brand", name: product.brand };
  if (product.mpn) data.mpn = product.mpn;
  return data;
}
