// Catalog data layer — React Query over Supabase. The catalogue is the never-deleted
// master; cost + stock are DERIVED from the PO/batch model (Phase 2). We read the products
// table (true non-null types + the category embed) and merge the derived on-hand /
// availability / weighted-average cost from the inventory views. Writes target products.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type Category = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  "id" | "slug" | "name" | "parent_id" | "sort_order"
>;
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type Availability = Database["public"]["Enums"]["availability"];

// Catalogue columns (from the table) + DERIVED stock/availability/cost (merged from the views).
export type ProductListItem = Pick<
  ProductRow,
  | "id" | "sku" | "slug" | "name" | "brand" | "category_id"
  | "short_description" | "description" | "compatibility"
  | "price_pkr" | "sale_price_pkr" | "reseller_price_pkr"
  | "mpn" | "meta_description"
  | "visibility" | "published" | "featured" | "status" | "owner_kind" | "investor_deal_id"
  | "images" | "specs" | "made_to_order" | "low_stock_threshold"
> & {
  categories: { name: string; parent_id: string | null } | null;
  on_hand_qty: number;
  batch_count: number;
  availability: Availability;
  weighted_avg_cost_pkr: number | null;
  stock_value_pkr: number | null; // batch-exact Σ remaining × landed_cost (matches ProductDetail)
};

const PRODUCT_COLUMNS =
  "id, sku, slug, name, brand, category_id, short_description, description, compatibility, " +
  "price_pkr, sale_price_pkr, reseller_price_pkr, mpn, meta_description, " +
  "visibility, published, featured, status, owner_kind, investor_deal_id, images, specs, made_to_order, low_stock_threshold, " +
  "categories(name, parent_id)";

type InvRow = { product_id: string | null; on_hand_qty: number | null; batch_count: number | null; availability: Availability | null };
type CostRow = { product_id: string | null; weighted_avg_cost_pkr: number | null; stock_value_pkr: number | null };

// Merge a products row with its derived inventory/cost (defaults for products with no batches).
function withDerived(p: Record<string, unknown>, iv: InvRow | undefined, cost: CostRow | undefined): ProductListItem {
  return {
    ...(p as unknown as Omit<ProductListItem, "categories" | "on_hand_qty" | "batch_count" | "availability" | "weighted_avg_cost_pkr" | "stock_value_pkr"> & {
      categories: ProductListItem["categories"];
    }),
    on_hand_qty: iv?.on_hand_qty ?? 0,
    batch_count: iv?.batch_count ?? 0,
    availability: (iv?.availability ?? "out_of_stock") as Availability,
    weighted_avg_cost_pkr: cost?.weighted_avg_cost_pkr ?? null,
    stock_value_pkr: cost?.stock_value_pkr ?? null,
  };
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name, parent_id, sort_order")
        .order("sort_order");
      if (error) throw new Error(friendlyError(error));
      return data ?? [];
    },
  });
}

// Product-source vendors (suppliers) — for the PO editor + vendor pickers.
export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers", "options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("active", true).order("name");
      if (error) throw new Error(friendlyError(error));
      return data ?? [];
    },
  });
}

export function useBrandOptions() {
  return useQuery({
    queryKey: ["product-brands"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("products").select("brand").not("brand", "is", null).order("brand");
      if (error) throw new Error(friendlyError(error));
      return [...new Set((data ?? []).map((r) => r.brand).filter((b): b is string => !!b))];
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<ProductListItem[]> => {
      const [prods, inv, cost] = await Promise.all([
        supabase.from("products").select(PRODUCT_COLUMNS).order("created_at", { ascending: false }),
        supabase.from("product_inventory").select("product_id, on_hand_qty, batch_count, availability"),
        supabase.from("product_cost").select("product_id, weighted_avg_cost_pkr, stock_value_pkr"),
      ]);
      if (prods.error) throw new Error(friendlyError(prods.error));
      if (inv.error) throw new Error(friendlyError(inv.error));
      if (cost.error) throw new Error(friendlyError(cost.error));
      const invMap = new Map((inv.data as InvRow[] | null ?? []).map((r) => [r.product_id, r]));
      const costMap = new Map((cost.data as CostRow[] | null ?? []).map((r) => [r.product_id, r]));
      return ((prods.data ?? []) as unknown as Record<string, unknown>[]).map((p) =>
        withDerived(p, invMap.get(p.id as string), costMap.get(p.id as string)),
      );
    },
  });
}

// Per-product economics (product_pnl view) for the Investor catalogue table: received/on-hand
// qty, landed cost, realized sales split by tier, COGS, and the latest PO's vendor + status.
// Returned keyed by product_id for O(1) lookup alongside useProducts().
export interface ProductPnl {
  product_id: string;
  received_qty: number;
  on_hand_qty: number;
  landed_cost_unit_pkr: number;
  qty_sold: number;
  revenue_retail_pkr: number;
  revenue_reseller_pkr: number;
  cogs_sold_pkr: number;
  vendor_name: string | null;
  po_status: string | null;
}
export function useProductPnl() {
  return useQuery({
    queryKey: ["product-pnl"],
    // Sales, gifts, builds, receiving and price edits all move these numbers from other pages;
    // refetch on mount (the catalogue is reached by tab-switch) so a return never shows stale P&L.
    staleTime: 0,
    queryFn: async (): Promise<Record<string, ProductPnl>> => {
      const { data, error } = await supabase.from("product_pnl").select("*");
      if (error) throw new Error(friendlyError(error));
      const n = (v: unknown) => Number(v ?? 0);
      const out: Record<string, ProductPnl> = {};
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const id = r.product_id as string;
        out[id] = {
          product_id: id,
          received_qty: n(r.received_qty),
          on_hand_qty: n(r.on_hand_qty),
          landed_cost_unit_pkr: n(r.landed_cost_unit_pkr),
          qty_sold: n(r.qty_sold),
          revenue_retail_pkr: n(r.revenue_retail_pkr),
          revenue_reseller_pkr: n(r.revenue_reseller_pkr),
          cogs_sold_pkr: n(r.cogs_sold_pkr),
          vendor_name: (r.vendor_name as string | null) ?? null,
          po_status: (r.po_status as string | null) ?? null,
        };
      }
      return out;
    },
  });
}

// Per-PURCHASE (PO line) detail for the In-House catalogue table: the landed-cost breakdown,
// prices, sold/PR consumption, amounts paid, and the PO's vendor + status. One row per purchase
// (a product bought twice yields two rows). Totals/markups/remaining/paid-flags derived in the UI.
export interface PurchaseLineDetail {
  line_id: string | null; // null when the product hasn't been ordered yet
  product_id: string;
  product_name: string;
  sku: string;
  category_id: string | null;
  owner_kind: "house" | "investor";
  retail_pkr: number | null;
  reseller_pkr: number | null;
  qty_ordered: number;
  qty_received: number;
  unit_cost_pkr: number;
  shipping_per_unit_pkr: number;
  packaging_per_unit_pkr: number;
  landed_cost_per_unit_pkr: number;
  landed_total_pkr: number;
  item_paid_amount_pkr: number | null;
  item_paid_on: string | null;
  ship_paid_amount_pkr: number | null;
  ship_paid_on: string | null;
  qty_sold: number;
  qty_pr: number;
  vendor_name: string | null;
  po_status: string | null;
  // What the goods actually cost in RMB, and the PKR rate frozen on that PO
  // (unit_cost_rmb × frozen_rate_rmb_pkr = unit_cost_pkr). Null/0 until the
  // 090096 migration is applied — the UI renders "—" rather than a wrong number.
  unit_cost_rmb: number | null;
  frozen_rate_rmb_pkr: number | null;
  po_created_at: string | null;
}

const n = (v: unknown) => Number(v ?? 0);
const nn = (v: unknown) => (v == null ? null : Number(v));

// Shared row mapper — used by the catalogue-wide table and the per-product detail card.
function mapPurchaseLine(r: unknown): PurchaseLineDetail {
  const o = r as Record<string, unknown>;
  return {
    line_id: (o.line_id as string | null) ?? null,
    product_id: o.product_id as string,
    product_name: (o.product_name as string) ?? "",
    sku: (o.sku as string) ?? "",
    category_id: (o.category_id as string | null) ?? null,
    owner_kind: o.owner_kind as "house" | "investor",
    retail_pkr: nn(o.retail_pkr),
    reseller_pkr: nn(o.reseller_pkr),
    qty_ordered: n(o.qty_ordered),
    qty_received: n(o.qty_received),
    unit_cost_pkr: n(o.unit_cost_pkr),
    shipping_per_unit_pkr: n(o.shipping_per_unit_pkr),
    packaging_per_unit_pkr: n(o.packaging_per_unit_pkr),
    landed_cost_per_unit_pkr: n(o.landed_cost_per_unit_pkr),
    landed_total_pkr: n(o.landed_total_pkr),
    item_paid_amount_pkr: nn(o.item_paid_amount_pkr),
    item_paid_on: (o.item_paid_on as string | null) ?? null,
    ship_paid_amount_pkr: nn(o.ship_paid_amount_pkr),
    ship_paid_on: (o.ship_paid_on as string | null) ?? null,
    qty_sold: n(o.qty_sold),
    qty_pr: n(o.qty_pr),
    vendor_name: (o.vendor_name as string | null) ?? null,
    po_status: (o.po_status as string | null) ?? null,
    unit_cost_rmb: nn(o.unit_cost_rmb),
    frozen_rate_rmb_pkr: nn(o.frozen_rate_rmb_pkr),
    po_created_at: (o.po_created_at as string | null) ?? null,
  };
}

export function usePurchaseLineDetail() {
  return useQuery({
    queryKey: ["purchase-line-detail"],
    staleTime: 0, // see useProductPnl — always fresh on return to the catalogue
    queryFn: async (): Promise<PurchaseLineDetail[]> => {
      const { data, error } = await supabase
        .from("purchase_line_detail")
        .select("*")
        .eq("owner_kind", "house")
        .order("po_created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map(mapPurchaseLine);
    },
  });
}

// Every purchase (PO line) of ONE product, newest first — powers the acquisition-cost card on
// the product detail screen. Rows with a null line_id (product created but never ordered) are
// dropped: there is no purchase to report a cost for.
export function useProductPurchases(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-purchases", productId],
    enabled: !!productId,
    staleTime: 0,
    queryFn: async (): Promise<PurchaseLineDetail[]> => {
      const { data, error } = await supabase
        .from("purchase_line_detail")
        .select("*")
        .eq("product_id", productId!)
        .order("po_created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map(mapPurchaseLine).filter((r) => r.line_id != null);
    },
  });
}

// Single product for the admin detail screen + its derived stock value.
export type ProductDetailRow = ProductListItem & { stock_value_pkr: number | null };

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["product", id],
    enabled: !!id,
    queryFn: async (): Promise<ProductDetailRow> => {
      const [p, iv, cost] = await Promise.all([
        supabase.from("products").select(PRODUCT_COLUMNS).eq("id", id!).single(),
        supabase.from("product_inventory").select("product_id, on_hand_qty, batch_count, availability").eq("product_id", id!).maybeSingle(),
        supabase.from("product_cost").select("product_id, weighted_avg_cost_pkr, stock_value_pkr").eq("product_id", id!).maybeSingle(),
      ]);
      if (p.error) throw new Error(friendlyError(p.error));
      const base = withDerived(p.data as unknown as Record<string, unknown>, (iv.data as InvRow | null) ?? undefined, (cost.data as CostRow | null) ?? undefined);
      return { ...base, stock_value_pkr: (cost.data as { stock_value_pkr: number | null } | null)?.stock_value_pkr ?? null };
    },
  });
}

export interface ProductOrderLine {
  orderId: string;
  orderNo: string | null;
  createdAt: string;
  stage: string;
  qty: number;
  pricePkr: number;
}
type OrderHistoryRow = {
  qty: number;
  price_pkr: number;
  orders: { id: string; order_no: string | null; created_at: string; stage: string } | null;
};

export function useProductOrderHistory(id: string | undefined) {
  return useQuery({
    queryKey: ["product-orders", id],
    enabled: !!id,
    queryFn: async (): Promise<ProductOrderLine[]> => {
      const { data, error } = await supabase
        .from("order_items")
        .select("qty, price_pkr, orders(id, order_no, created_at, stage)")
        .eq("product_id", id!);
      if (error) throw new Error(friendlyError(error));
      return ((data ?? []) as unknown as OrderHistoryRow[])
        .filter((r): r is OrderHistoryRow & { orders: NonNullable<OrderHistoryRow["orders"]> } => !!r.orders)
        .map((r) => ({
          orderId: r.orders.id,
          orderNo: r.orders.order_no,
          createdAt: r.orders.created_at,
          stage: r.orders.stage,
          qty: r.qty,
          pricePkr: r.price_pkr,
        }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
  });
}

const money = z.number({ invalid_type_error: "Enter a number" }).finite().nonnegative("Must be 0 or more").nullable();

export const productSchema = z
  .object({
    sku: z.string().trim().optional(),
    slug: z.string().trim().optional(),
    name: z.string().trim().min(1, "Name is required"),
    brand: z.string().trim().nullable(),
    category_id: z.string().uuid("Choose a category"),
    short_description: z.string().nullable(),
    description: z.string().nullable(),
    compatibility: z.string().nullable(),
    status: z.enum(["active", "paused", "discontinued"]),
    owner_kind: z.enum(["house", "investor"]),
    investor_deal_id: z.string().uuid().nullable(),
    visibility: z.enum(["visible", "hidden", "archived"]),
    published: z.boolean(),
    featured: z.boolean(),
    made_to_order: z.boolean(),
    // null = follow settings.low_stock_threshold (the house default); a number overrides it.
    low_stock_threshold: z.number().int().nonnegative().nullable(),
    price_pkr: money,
    sale_price_pkr: money,
    reseller_price_pkr: money,
    mpn: z.string().trim().nullable(),
    meta_description: z.string().trim().max(160, "Keep the meta description to 160 characters or fewer").nullable(),
    images: z.array(z.string().trim().min(1)),
    specs: z.array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) })),
  })
  .superRefine((v, ctx) => {
    if (v.sale_price_pkr != null && v.price_pkr != null && v.sale_price_pkr > v.price_pkr) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sale_price_pkr"], message: "Sale price must be at or below the regular price" });
    }
    // Mirror the DB CHECK products_owner_deal_consistency.
    if (v.owner_kind === "investor" && !v.investor_deal_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["investor_deal_id"], message: "Choose the investor deal that owns this product" });
    }
    if (v.reseller_price_pkr != null && v.price_pkr != null && v.reseller_price_pkr > v.price_pkr) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reseller_price_pkr"], message: "Reseller price must be at or below the retail price" });
    }
  });
export type ProductInput = z.infer<typeof productSchema>;

// Editor preview of the derived availability. Stock comes from batches (read-only), so
// this reads the product's current on-hand; made-to-order wins.
export function deriveAvailability(onHand: number, threshold: number, madeToOrder: boolean): Availability {
  if (madeToOrder) return "made_to_order";
  if (onHand <= 0) return "out_of_stock";
  if (onHand <= threshold) return "low_stock";
  return "in_stock";
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ProductInput }) => {
      const parsed = productSchema.parse(input);
      const payload = { ...parsed, specs: parsed.specs as unknown as Database["public"]["Tables"]["products"]["Insert"]["specs"] };
      const res = id
        ? await supabase.from("products").update(payload).eq("id", id)
        : await supabase.from("products").insert(payload);
      if (res.error) throw new Error(friendlyError(res.error));
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      if (vars.id) qc.invalidateQueries({ queryKey: ["product", vars.id] });
      // price / owner / name feed the Investor + In-House catalogue P&L tables
      qc.invalidateQueries({ queryKey: ["product-pnl"] });
      qc.invalidateQueries({ queryKey: ["purchase-line-detail"] });
    },
  });
}

export function useUpdateProductPrice() {
  const qc = useQueryClient();
  return useMutation({
    // Retail price is required; reseller is optional (only patched when provided) and must sit at or
    // below retail, mirroring the productSchema refine so a quick reprice can't invert the tiers.
    mutationFn: async ({ id, price_pkr, reseller_price_pkr }: { id: string; price_pkr: number; reseller_price_pkr?: number | null }) => {
      if (!Number.isFinite(price_pkr) || price_pkr < 0) throw new Error("Enter a price of 0 or more.");
      const patch: { price_pkr: number; reseller_price_pkr?: number | null } = { price_pkr };
      if (reseller_price_pkr !== undefined) {
        if (reseller_price_pkr != null && (!Number.isFinite(reseller_price_pkr) || reseller_price_pkr < 0)) throw new Error("Enter a reseller price of 0 or more.");
        if (reseller_price_pkr != null && reseller_price_pkr > price_pkr) throw new Error("Reseller price must be at or below the retail price.");
        patch.reseller_price_pkr = reseller_price_pkr;
      }
      const { error } = await supabase.from("products").update(patch).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", vars.id] });
      // a retail-price change moves revenue / margin in the catalogue P&L tables
      qc.invalidateQueries({ queryKey: ["product-pnl"] });
      qc.invalidateQueries({ queryKey: ["purchase-line-detail"] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product-pnl"] });
      qc.invalidateQueries({ queryKey: ["purchase-line-detail"] });
    },
  });
}

export interface CategoryGroup {
  parent: Category | null;
  leaves: Category[];
}
export function groupCategories(categories: Category[]): CategoryGroup[] {
  const isParent = (c: Category) => categories.some((x) => x.parent_id === c.id);
  const bySort = (a: Category, b: Category) => a.sort_order - b.sort_order;

  const groups: CategoryGroup[] = categories
    .filter((c) => c.parent_id === null && isParent(c))
    .sort(bySort)
    .map((p) => ({
      parent: p,
      leaves: categories.filter((c) => c.parent_id === p.id).sort(bySort),
    }));

  for (const s of categories.filter((c) => c.parent_id === null && !isParent(c)).sort(bySort)) {
    groups.push({ parent: null, leaves: [s] });
  }
  return groups;
}
