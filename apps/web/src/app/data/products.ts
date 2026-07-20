// ---------------------------------------------------------------------------
// 360 Performance — Website catalogue TYPES.
// Data is fetched from Supabase (anon, published-only) via api.ts. A category is
// identified by its slug; products carry their leaf category + its parent rollup.
// ---------------------------------------------------------------------------

export type CategoryId = string; // a category slug (leaf or parent)

export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
}

export type Availability = "in-stock" | "low-stock" | "made-to-order" | "out-of-stock";

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  name: string;
  brand: string;
  category: string; // leaf category slug
  categoryName: string;
  parentSlug: string; // parent (or self, for standalone leaves) category slug
  parentName: string;
  pricePKR: number;
  images: string[]; // resolved public URLs
  shortDescription: string;
  description: string;
  specs: ProductSpec[];
  availability: Availability;
  featured: boolean;
  createdAt: string; // ISO date — used for "newest" sort
  mpn: string;
  metaDescription: string;
  salePricePKR: number | null;
  stockQty: number | null;
}
