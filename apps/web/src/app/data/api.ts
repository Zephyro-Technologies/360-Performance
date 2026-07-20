// ---------------------------------------------------------------------------
// 360 Performance — Data access layer (the SINGLE SEAM between UI and data).
// Reads Supabase as the ANON role, published-only (products via products_public;
// published blog/testimonials; the active announcement). The website is read-only
// (WhatsApp ordering) — there are NO write paths here. DB rows are mapped to the
// web view-model types so components don't depend on schema column names.
// ---------------------------------------------------------------------------
import { imageUrl } from "@360/supabase";
import { supabase } from "./supabase";
import type { Product, Category, ProductSpec, Availability } from "./products";
import type { Testimonial, BlogPost } from "./content";

export type SortOption = "newest" | "price-asc" | "price-desc" | "name";

export interface CatalogueQuery {
  category?: string; // leaf or parent slug, or "all"
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
}

export interface CatalogueResult {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PRODUCT_COLS =
  "id, slug, name, brand, category_slug, category_name, parent_slug, parent_name, price_pkr, " +
  "short_description, description, images, specs, availability, featured, created_at, sku, mpn, meta_description, sale_price_pkr, stock_qty";

const AVAIL: Record<string, Availability> = {
  in_stock: "in-stock",
  low_stock: "low-stock",
  made_to_order: "made-to-order",
  out_of_stock: "out-of-stock",
};

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category_slug: string;
  category_name: string;
  parent_slug: string;
  parent_name: string;
  price_pkr: number;
  short_description: string | null;
  description: string | null;
  images: string[] | null;
  specs: unknown;
  availability: string;
  featured: boolean;
  created_at: string;
  sku: string;
  mpn: string | null;
  meta_description: string | null;
  sale_price_pkr: number | null;
  stock_qty: number | null;
}

function parseSpecs(j: unknown): ProductSpec[] {
  if (!Array.isArray(j)) return [];
  return j
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ label: String(x.label ?? ""), value: String(x.value ?? "") }))
    .filter((s) => s.label || s.value);
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand ?? "",
    category: row.category_slug,
    categoryName: row.category_name,
    parentSlug: row.parent_slug,
    parentName: row.parent_name,
    pricePKR: Number(row.price_pkr),
    images: (row.images ?? []).map((p) => imageUrl(supabase, "product-images", p)).filter(Boolean),
    shortDescription: row.short_description ?? "",
    description: row.description ?? "",
    specs: parseSpecs(row.specs),
    availability: AVAIL[row.availability] ?? "made-to-order",
    featured: !!row.featured,
    createdAt: row.created_at,
    sku: row.sku,
    mpn: row.mpn ?? "",
    metaDescription: row.meta_description ?? "",
    salePricePKR: row.sale_price_pkr === null ? null : Number(row.sale_price_pkr),
    stockQty: row.stock_qty === null ? null : Number(row.stock_qty),
  };
}

const rows = (data: unknown): ProductRow[] => (data as ProductRow[] | null) ?? [];

// PostgREST or() injection-safety: keep search terms free of the , ( ) % chars.
const safeTerm = (s: string) => s.trim().replace(/[,()%*\\]/g, " ").trim();
// Category slugs are [a-z0-9-]; strip anything else before interpolating into or().
const slugSafe = (s: string) => s.replace(/[^a-z0-9-]/gi, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, parent_id, sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ id: c.id, slug: c.slug, name: c.name, parentId: c.parent_id }));
}

export async function getAnnouncement(): Promise<string> {
  const { data, error } = await supabase
    .from("announcements")
    .select("message")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.message ?? "";
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products_public")
    .select(PRODUCT_COLS)
    .eq("featured", true)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return rows(data).map(mapProduct);
}

export async function getProductById(idOrSlug: string): Promise<Product | undefined> {
  const base = supabase.from("products_public").select(PRODUCT_COLS).limit(1);
  const { data, error } = UUID.test(idOrSlug)
    ? await base.eq("id", idOrSlug).maybeSingle()
    : await base.eq("slug", idOrSlug).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapProduct(data as unknown as ProductRow) : undefined;
}

export async function getRelatedProducts(idOrSlug: string): Promise<Product[]> {
  const product = await getProductById(idOrSlug);
  if (!product) return [];
  const { data, error } = await supabase
    .from("products_public")
    .select(PRODUCT_COLS)
    .eq("category_slug", product.category)
    .neq("id", product.id)
    .order("featured", { ascending: false })
    .order("id", { ascending: true })
    .limit(4);
  if (error) throw new Error(error.message);
  return rows(data).map(mapProduct);
}

export async function suggestProducts(term: string, limit = 6): Promise<Product[]> {
  const q = safeTerm(term);
  if (!q) return [];
  const { data, error } = await supabase
    .from("products_public")
    .select(PRODUCT_COLS)
    .or(`name.ilike.%${q}%,brand.ilike.%${q}%,sku.ilike.%${q}%`)
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return rows(data).map(mapProduct);
}

export async function getProducts(query: CatalogueQuery = {}): Promise<CatalogueResult> {
  const { category = "all", search = "", minPrice, maxPrice, inStockOnly = false, sort = "newest", page = 1, pageSize = 9 } = query;

  let q = supabase.from("products_public").select(PRODUCT_COLS, { count: "exact" });
  if (category !== "all") {
    const c = slugSafe(category);
    if (c) q = q.or(`category_slug.eq.${c},parent_slug.eq.${c}`);
  }
  const term = safeTerm(search);
  if (term) q = q.or(`name.ilike.%${term}%,brand.ilike.%${term}%,short_description.ilike.%${term}%,sku.ilike.%${term}%`);
  if (typeof minPrice === "number") q = q.gte("effective_price_pkr", minPrice);
  if (typeof maxPrice === "number") q = q.lte("effective_price_pkr", maxPrice);
  if (inStockOnly) q = q.neq("availability", "out_of_stock");

  // Sort/range-filter by the price the customer actually sees (sale when present).
  if (sort === "price-asc") q = q.order("effective_price_pkr", { ascending: true });
  else if (sort === "price-desc") q = q.order("effective_price_pkr", { ascending: false });
  else if (sort === "name") q = q.order("name", { ascending: true });
  else q = q.order("created_at", { ascending: false });
  q = q.order("id", { ascending: true }); // unique tiebreaker — stable pagination

  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  const { data, count, error } = await q.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { items: rows(data).map(mapProduct), total, page: safePage, pageSize, totalPages };
}

export async function getTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from("testimonials")
    .select("id, name, location, rating, quote")
    .eq("published", true)
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    location: t.location ?? "",
    rating: t.rating ?? 5,
    quote: t.quote ?? "",
  }));
}

interface BlogRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  hero_image: string | null;
  author: string | null;
  read_minutes: number | null;
  body_md: string | null;
  published_at: string | null;
  created_at: string;
}

function mapBlog(b: BlogRow): BlogPost {
  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    date: b.published_at ?? b.created_at,
    excerpt: b.excerpt ?? "",
    image: imageUrl(supabase, "blog-images", b.hero_image),
    author: b.author ?? undefined,
    readMinutes: b.read_minutes ?? undefined,
    bodyMd: b.body_md ?? undefined,
  };
}

const BLOG_COLS = "id, slug, title, excerpt, hero_image, author, read_minutes, body_md, published_at, created_at";

export async function getBlogPosts(limit?: number): Promise<BlogPost[]> {
  let q = supabase
    .from("blog_posts")
    .select(BLOG_COLS)
    .eq("published", true)
    .order("published_at", { ascending: false, nullsFirst: false });
  if (typeof limit === "number") q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as unknown as BlogRow[] | null) ?? []).map(mapBlog);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const { data, error } = await supabase
    .from("blog_posts")
    .select(BLOG_COLS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBlog(data as unknown as BlogRow) : undefined;
}
