// Admin product detail — a real internal dashboard for one product: the full business
// picture the storefront hides (cost, margin, landed cost, supplier) plus order history.
// Route /products/:id; Edit/Delete act here. All internal columns are read behind auth
// via RLS and are never exposed to products_public.
import { useState, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { usePageHeader } from "../components/common/PageHeader";
import { toast } from "sonner";
import {
  useProduct,
  useProductOrderHistory,
  useProductPurchases,
  useCategories,
  useDeleteProduct,
} from "../data/catalog";
import { ProductDialog } from "../components/products/ProductDialog";
import { useAuth } from "../data/auth";
import { useLowStockDefault } from "../data/settings";
import { imageUrl } from "../data/storage";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { Button } from "@360/ui/button";
import { cn } from "@360/ui/utils";
import { formatPKR, formatDate } from "@360/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@360/ui/table";
import { useConfirm } from "../components/common/confirm";

const AVAIL_LABEL: Record<string, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  made_to_order: "Made to Order",
  out_of_stock: "Out of Stock",
};

const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatPKR(v));

// Goods are bought from the vendor in RMB and converted at the rate frozen on that PO.
const RMB_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const rmb = (v: number | null | undefined) => (v == null ? "—" : `¥${RMB_FMT.format(v)}`);
const rate = (v: number | null | undefined) => (v == null ? "—" : RMB_FMT.format(v));

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border border-border bg-card p-5", className)}>
      <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, mono, highlight }: { label: string; value: ReactNode; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-sm tabular-nums", mono && "font-mono", highlight && "font-semibold text-foreground")}>{value}</dd>
    </div>
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const productQ = useProduct(id);
  const categoriesQ = useCategories();
  const historyQ = useProductOrderHistory(id);
  const purchasesQ = useProductPurchases(id);
  const lowStockDefaultQ = useLowStockDefault();
  // Above the loading/error early-returns: a hook must run on every render.
  const confirm = useConfirm();
  const del = useDeleteProduct();
  const { can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  usePageHeader("Catalogue", productQ.data?.name);

  if (productQ.isLoading) {
    return <p className="py-16 text-center text-muted-foreground">Loading product…</p>;
  }
  if (productQ.isError || !productQ.data) {
    return (
      <div className="py-16 text-center">
        <p className="text-[#cc0000]">{productQ.error instanceof Error ? productQ.error.message : "Product not found."}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/products")}>Back to catalogue</Button>
      </div>
    );
  }

  const p = productQ.data;
  const cats = categoriesQ.data ?? [];
  const leaf = cats.find((c) => c.id === p.category_id);
  const parent = leaf?.parent_id ? cats.find((c) => c.id === leaf.parent_id) : null;
  const categoryPath = leaf ? (parent ? `${parent.name} › ${leaf.name}` : leaf.name) : "—";

  const cost = p.weighted_avg_cost_pkr; // derived weighted-average of on-hand batches
  const margin = p.price_pkr != null && cost != null ? p.price_pkr - cost : null;
  const marginPct = margin != null && p.price_pkr ? (margin / p.price_pkr) * 100 : null;
  const onSale = p.sale_price_pkr != null && p.price_pkr != null && p.sale_price_pkr < p.price_pkr;
  const saleMargin = onSale && cost != null ? p.sale_price_pkr! - cost : null;
  const saleMarginPct = saleMargin != null && p.sale_price_pkr ? (saleMargin / p.sale_price_pkr) * 100 : null;

  const history = historyQ.data ?? [];

  async function remove() {
    if (!(await confirm({ title: `Delete ${p.name}?`, description: "This cannot be undone.", destructive: true }))) return;
    try {
      await del.mutateAsync(p.id);
      toast.success("Product deleted");
      navigate("/products");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/products" className="inline-flex items-center gap-1.5 rounded-md bg-[#cc0000]/10 px-2.5 py-1 text-sm font-medium text-[#cc0000] transition-colors hover:bg-[#cc0000]/20">
          <ArrowLeft className="size-4" /> Catalogue
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl">{p.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono">{p.sku}</span> · {categoryPath}
              {p.brand && <> · {p.brand}</>}
            </p>
          </div>
          {can("edit") && (
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="size-4" /> Edit</Button>
              {can("delete") && (
                <Button variant="outline" className="border-[#cc0000]/30 text-[#cc0000] hover:bg-[#cc0000]/5" onClick={remove}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.published
            ? <Pill className="border-green-200 bg-green-50 text-green-700">Published</Pill>
            : <Pill className="border-border bg-muted text-muted-foreground">Draft</Pill>}
          {p.visibility !== "visible" && <Pill className="border-amber-200 bg-amber-50 text-amber-700 capitalize">{p.visibility}</Pill>}
          {p.featured && <Pill className="border-[#cc0000]/30 bg-[#cc0000]/5 text-[#cc0000]">Featured</Pill>}
          <Pill className="border-border bg-secondary text-foreground">{AVAIL_LABEL[p.availability] ?? p.availability}</Pill>
          {p.owner_kind === "investor" && <Pill className="border-violet-200 bg-violet-50 text-violet-700">Investor-owned</Pill>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Pricing & margin">
          <dl>
            <Field
              label="Price"
              value={onSale ? (
                <span>
                  <span className="text-[#cc0000]">{money(p.sale_price_pkr)}</span>{" "}
                  <span className="text-xs text-muted-foreground line-through">{money(p.price_pkr)}</span>
                </span>
              ) : money(p.price_pkr)}
            />
            <Field label="Sale price" value={money(p.sale_price_pkr)} />
            <Field label="Reseller price (internal)" value={money(p.reseller_price_pkr)} />
            <Field label="Weighted-avg cost (derived)" value={money(p.weighted_avg_cost_pkr)} />
            {/* Accounting margin (profit ÷ PRICE) — deliberately different from the catalogue's
                "Markup" columns (profit ÷ COST, matching the client's spreadsheet). Both are
                labelled for what they are so the two screens can't be read as contradicting. */}
            <Field
              label="Margin (profit ÷ price, at list)"
              highlight
              value={margin != null ? `${money(margin)}${marginPct != null ? ` · ${marginPct.toFixed(1)}%` : ""}` : "—"}
            />
            {onSale && (
              <Field
                label="Margin (profit ÷ price, at sale)"
                highlight
                value={saleMargin != null ? `${money(saleMargin)}${saleMarginPct != null ? ` · ${saleMarginPct.toFixed(1)}%` : ""}` : "—"}
              />
            )}
            <Field label="Stock value (on-hand × cost)" value={money(p.stock_value_pkr)} />
          </dl>
        </Card>

        <Card title="Inventory">
          <dl>
            <Field label="Mode" value={p.made_to_order ? "Made to order (sourced via PO)" : "Track stock"} />
            <Field label="Availability" value={AVAIL_LABEL[p.availability] ?? p.availability} />
            <Field label="On hand (Σ batches)" value={String(p.on_hand_qty)} />
            <Field label="Batches" value={String(p.batch_count)} />
            {/* null = follow the house default (090115 made the column nullable and backfilled
                every row that sat on the old default of 3, so this is the common case). */}
            {!p.made_to_order && (
              <Field
                label="Low-stock threshold"
                value={
                  p.low_stock_threshold != null
                    ? String(p.low_stock_threshold)
                    : lowStockDefaultQ.data != null
                      ? `${lowStockDefaultQ.data} (house default)`
                      : "House default"
                }
              />
            )}
          </dl>
        </Card>

        {/* What each purchase actually cost in RMB, plus the rate frozen on that PO. A product
            bought more than once lists every purchase rather than one blended number, so a run
            bought at ¥400 and a later one at ¥600 stay visible side by side. */}
        <Card title="Acquisition cost (per purchase)" className="lg:col-span-2">
          {purchasesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading purchases…</p>
          ) : (purchasesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not purchased yet — the cost appears once this product is ordered on a purchase order.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit cost (RMB)</TableHead>
                  <TableHead className="text-right">RMB rate</TableHead>
                  <TableHead className="text-right">Unit cost (PKR)</TableHead>
                  <TableHead className="text-right">Landed / unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(purchasesQ.data ?? []).map((r) => (
                  <TableRow key={r.line_id ?? r.product_id}>
                    <TableCell>{r.vendor_name ?? "—"}</TableCell>
                    <TableCell>{r.po_created_at ? formatDate(r.po_created_at) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.qty_ordered}</TableCell>
                    <TableCell className="text-right tabular-nums">{rmb(r.unit_cost_rmb)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{rate(r.frozen_rate_rmb_pkr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.unit_cost_pkr)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(r.landed_cost_per_unit_pkr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card title="Identifiers & ownership">
          <dl>
            <Field label="SKU" value={p.sku} mono />
            <Field label="Slug" value={p.slug} mono />
            <Field label="MPN" value={p.mpn ?? "—"} />
            <Field label="Owner" value={p.owner_kind === "investor" ? "Investor-owned" : "House (360)"} />
            <Field label="Status" value={p.status} />
          </dl>
        </Card>

        <Card title="Content">
          <dl>
            <Field label="Short description" value={p.short_description ?? "—"} />
            <Field label="Meta description" value={p.meta_description ?? "—"} />
          </dl>
          {p.description && (
            <div className="mt-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap text-sm">{p.description}</p>
            </div>
          )}
          {p.compatibility && (
            <div className="mt-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Compatibility</p>
              <p className="whitespace-pre-wrap text-sm">{p.compatibility}</p>
            </div>
          )}
          {Array.isArray(p.specs) && (p.specs as { label: string; value: string }[]).length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Specs</p>
              <dl>
                {(p.specs as { label: string; value: string }[]).map((s, i) => (
                  <Field key={i} label={s.label} value={s.value} />
                ))}
              </dl>
            </div>
          )}
        </Card>
      </div>

      <Card title={`Images (${p.images.length})`}>
        {p.images.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images uploaded.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {p.images.map((img, i) => (
              <div key={i} className="relative">
                <ImageWithFallback
                  src={imageUrl("product-images", img)}
                  alt={`${p.name} image ${i + 1}`}
                  className="size-24 rounded-md border border-border object-cover"
                />
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">Primary</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Order history">
        {historyQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading order history…</p>
        ) : historyQ.isError ? (
          <p className="text-sm text-[#cc0000]">{(historyQ.error as Error).message}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">This product hasn't appeared on any orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Line price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h, i) => (
                  <TableRow key={`${h.orderId}-${i}`}>
                    <TableCell className="font-mono">{h.orderNo ?? "—"}</TableCell>
                    <TableCell>{new Date(h.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="capitalize">{h.stage}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(h.pricePkr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ProductDialog product={p} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
