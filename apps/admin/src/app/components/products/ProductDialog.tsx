// Add / edit a product — the CATALOGUE master editor. Cost + stock are NOT entered here:
// they come from Purchase Orders -> receipt (batches). The editor owns identity, pricing
// (retail / sale / internal reseller), status, ownership, the availability mode, and
// content; it shows derived on-hand + weighted-average cost read-only.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Link } from "react-router";
import { useInvestorDeals, dealLabel } from "../../data/investors";
import {
  useCategories,
  useSaveProduct,
  useBrandOptions,
  groupCategories,
  deriveAvailability,
  productSchema,
  type Availability,
  type ProductInput,
  type ProductListItem,
} from "../../data/catalog";
import { useLowStockDefault } from "../../data/settings";
import { ImageUploader } from "../common/ImageUploader";
import { CategorySelect } from "./CategorySelect";
import { formatPKR } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import { Switch } from "@360/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@360/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";

const AVAIL_LABEL: Record<Availability, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  made_to_order: "Made to Order",
  out_of_stock: "Out of Stock",
};
const STATUS: { value: ProductInput["status"]; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "discontinued", label: "Discontinued" },
];
const OWNER: { value: ProductInput["owner_kind"]; label: string }[] = [
  { value: "house", label: "House (360)" },
  { value: "investor", label: "Investor-owned" },
];
const VIS: { value: ProductInput["visibility"]; label: string }[] = [
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "archived", label: "Archived" },
];

const FIELD_ORDER = ["name", "category_id", "price_pkr", "sale_price_pkr", "reseller_price_pkr", "investor_deal_id", "meta_description"];

interface SpecRow {
  label: string;
  value: string;
}
interface FormState {
  sku: string; // read-only (DB-assigned); shown, never sent
  name: string;
  brand: string;
  category_id: string;
  short_description: string;
  description: string;
  compatibility: string;
  status: ProductInput["status"];
  owner_kind: ProductInput["owner_kind"];
  investor_deal_id: string;
  visibility: ProductInput["visibility"];
  published: boolean;
  featured: boolean;
  made_to_order: boolean;
  low_stock_threshold: string;
  price_pkr: string;
  sale_price_pkr: string;
  reseller_price_pkr: string;
  mpn: string;
  meta_description: string;
  images: string[];
  specs: SpecRow[];
}

const numStr = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

function parseSpecs(j: unknown): SpecRow[] {
  if (!Array.isArray(j)) return [];
  return j
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ label: String(x.label ?? ""), value: String(x.value ?? "") }))
    .filter((s) => s.label || s.value);
}

function fromProduct(p: ProductListItem | null): FormState {
  return {
    sku: p?.sku ?? "",
    name: p?.name ?? "",
    brand: p?.brand ?? "",
    category_id: p?.category_id ?? "",
    short_description: p?.short_description ?? "",
    description: p?.description ?? "",
    compatibility: p?.compatibility ?? "",
    status: p?.status ?? "active",
    owner_kind: p?.owner_kind ?? "house",
    investor_deal_id: p?.investor_deal_id ?? "",
    visibility: p?.visibility ?? "visible",
    published: p?.published ?? false,
    featured: p?.featured ?? false,
    made_to_order: p?.made_to_order ?? true, // new products default to Made to order (sourced via PO)
    // Blank = follow the house default; only a typed number is an override.
    low_stock_threshold: p?.low_stock_threshold == null ? "" : numStr(p.low_stock_threshold),
    price_pkr: numStr(p?.price_pkr ?? null),
    sale_price_pkr: numStr(p?.sale_price_pkr ?? null),
    reseller_price_pkr: numStr(p?.reseller_price_pkr ?? null),
    mpn: p?.mpn ?? "",
    meta_description: p?.meta_description ?? "",
    images: p?.images ?? [],
    specs: parseSpecs(p?.specs),
  };
}

const toNum = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export function ProductDialog({
  product,
  open,
  onOpenChange,
}: {
  product: ProductListItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const categoriesQ = useCategories();
  const lowStockDefaultQ = useLowStockDefault();
  const brandsQ = useBrandOptions();
  const dealsQ = useInvestorDeals();
  const save = useSaveProduct();

  const [form, setForm] = useState<FormState>(fromProduct(null));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(fromProduct(product));
      setErrors({});
    }
  }, [product, open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as string] ? { ...e, [key as string]: "" } : e));
  }

  function setName(name: string) {
    setForm((f) => ({ ...f, name }));
    setErrors((e) => (e.name ? { ...e, name: "" } : e));
  }

  const groups = useMemo(() => groupCategories(categoriesQ.data ?? []), [categoriesQ.data]);
  const onHand = product?.on_hand_qty ?? 0;
  // Blank box ⇒ the preview uses the house default, so it shows what will actually happen.
  const globalThreshold = lowStockDefaultQ.data ?? 3;
  const effectiveThreshold = form.low_stock_threshold.trim() === "" ? globalThreshold : Number(form.low_stock_threshold) || 0;
  const derived = deriveAvailability(onHand, effectiveThreshold, form.made_to_order);

  const fieldErr = (k: string) =>
    errors[k] ? <p className="text-xs font-medium text-destructive">{errors[k]}</p> : null;

  function focusFirstError(errs: Record<string, string>) {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`field-${first}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    });
  }

  async function onSubmit() {
    const input: ProductInput = {
      // sku + slug are assigned by the DB on insert and preserved on update — never sent.
      name: form.name,
      brand: form.brand.trim() || null,
      category_id: form.category_id,
      short_description: form.short_description.trim() || null,
      description: form.description.trim() || null,
      compatibility: form.compatibility.trim() || null,
      status: form.status,
      owner_kind: form.owner_kind,
      investor_deal_id: form.owner_kind === "investor" ? form.investor_deal_id || null : null,
      visibility: form.visibility,
      published: form.price_pkr.trim() ? form.published : false, // never publish an unpriced product
      featured: form.featured,
      made_to_order: form.made_to_order,
      low_stock_threshold: form.low_stock_threshold.trim() === "" ? null : (toNum(form.low_stock_threshold) ?? null),
      price_pkr: toNum(form.price_pkr),
      sale_price_pkr: toNum(form.sale_price_pkr),
      reseller_price_pkr: toNum(form.reseller_price_pkr),
      mpn: form.mpn.trim() || null,
      meta_description: form.meta_description.trim() || null,
      images: form.images,
      specs: form.specs.filter((s) => s.label.trim() && s.value.trim()),
    };

    const result = productSchema.safeParse(input);
    const fieldErrors: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const k = String(issue.path[0] ?? "");
        if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
      }
    }
    if (form.published && !form.price_pkr.trim()) fieldErrors.price_pkr = "Price is required to publish";

    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      focusFirstError(fieldErrors);
      return;
    }

    setErrors({});
    try {
      await save.mutateAsync({ id: product?.id, input: result.data! });
      toast.success(product ? "Product updated" : "Product created");
      onOpenChange(false);
    } catch (e) {
      const msg =
        e instanceof z.ZodError
          ? e.issues[0]?.message ?? "Please check the form."
          : e instanceof Error
            ? e.message
            : "Could not save product.";
      if (/slug/i.test(msg)) setErrors((x) => ({ ...x, slug: msg }));
      else if (/sku/i.test(msg)) setErrors((x) => ({ ...x, sku: msg }));
      toast.error(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "New Product"}</DialogTitle>
          <DialogDescription>Published products appear on the public website. Cost &amp; stock come from Purchase Orders.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2" id="field-name">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
            {fieldErr("name")}
          </div>

          <div className="space-y-2 sm:col-span-2" id="field-category_id">
            <Label>Category</Label>
            <CategorySelect key={product?.id ?? "new"} groups={groups} value={form.category_id} onChange={(v) => set("category_id", v)} />
            {fieldErr("category_id")}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Brand</Label>
            <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} list="product-brand-options" placeholder="e.g. FLOW" />
            <datalist id="product-brand-options">
              {(brandsQ.data ?? []).map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>SKU <span className="text-muted-foreground">(auto-assigned · read-only)</span></Label>
            <Input
              value={form.sku}
              readOnly
              disabled
              placeholder="Generated from the category on save, e.g. AL-001"
              className="bg-muted/50 text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              {product
                ? "Assigned when this product was created. Search by it; not editable."
                : "A category-prefixed code (e.g. DOW-001) and a URL slug are assigned automatically on save."}
            </p>
          </div>

          <div className="mt-1 border-t border-border pt-3 sm:col-span-2">
            <span className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Pricing</span>
          </div>
          {/* Retail + Reseller share a row; bottom-align so the inputs line up even when the
              two labels wrap to different heights. */}
          <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2 sm:items-end">
            <div className="space-y-2" id="field-price_pkr">
              <Label>Retail price (PKR) <span className="text-muted-foreground">(required to publish)</span></Label>
              <Input type="number" min={0} value={form.price_pkr} onChange={(e) => set("price_pkr", e.target.value)} />
              {fieldErr("price_pkr")}
            </div>
            <div className="space-y-2" id="field-reseller_price_pkr">
              <Label>Reseller price (PKR) <span className="text-muted-foreground">(internal · quoting only)</span></Label>
              <Input type="number" min={0} value={form.reseller_price_pkr} onChange={(e) => set("reseller_price_pkr", e.target.value)} />
              {fieldErr("reseller_price_pkr")}
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2" id="field-sale_price_pkr">
            <Label>Sale price (PKR) <span className="text-muted-foreground">(optional promo)</span></Label>
            <Input type="number" min={0} value={form.sale_price_pkr} onChange={(e) => set("sale_price_pkr", e.target.value)} />
            {fieldErr("sale_price_pkr")}
          </div>

          <div className="mt-1 border-t border-border pt-3 sm:col-span-2">
            <span className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Catalogue status &amp; ownership</span>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v as ProductInput["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Select value={form.owner_kind} onValueChange={(v) => set("owner_kind", v as ProductInput["owner_kind"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{OWNER.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.owner_kind === "investor" && (
            <div className="space-y-2 sm:col-span-2" id="field-investor_deal_id">
              <Label>Investor deal</Label>
              {(dealsQ.data ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  No investor deals yet. Create one in{" "}
                  <Link to="/investors" className="font-medium text-[#cc0000] hover:underline">Investors</Link> first.
                </p>
              ) : (
                <Select value={form.investor_deal_id} onValueChange={(v) => set("investor_deal_id", v)}>
                  <SelectTrigger aria-label="Investor deal"><SelectValue placeholder="Choose the deal that owns this product" /></SelectTrigger>
                  <SelectContent>{(dealsQ.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{dealLabel(d)}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {fieldErr("investor_deal_id")}
              <p className="text-xs text-muted-foreground">Sets the investor + profit split. Sold units accrue capital + their share to the investor (settled in Investors).</p>
            </div>
          )}

          <div className="mt-1 border-t border-border pt-3 sm:col-span-2">
            <span className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Inventory &amp; visibility</span>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Availability mode</Label>
            <div className="flex w-fit rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => set("made_to_order", false)}
                className={`rounded px-3 py-1.5 text-sm transition-colors ${!form.made_to_order ? "bg-[#cc0000] text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                Track stock
              </button>
              <button
                type="button"
                onClick={() => set("made_to_order", true)}
                className={`rounded px-3 py-1.5 text-sm transition-colors ${form.made_to_order ? "bg-[#cc0000] text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                Made to order
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Shown on the storefront as <span className="font-medium text-foreground">{AVAIL_LABEL[derived]}</span>
              {form.made_to_order ? ", sourced via a Purchase Order when ordered." : ", from on-hand batch stock."}
            </p>
          </div>

          {/* Derived stock + cost (read-only — driven by batches) */}
          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">On hand <span className="text-xs">(Σ batches)</span></span>
              <span className="font-medium tabular-nums">{onHand}{product && product.batch_count ? ` · ${product.batch_count} batch${product.batch_count === 1 ? "" : "es"}` : ""}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">Weighted-avg cost</span>
              <span className="font-medium tabular-nums">{product?.weighted_avg_cost_pkr != null ? formatPKR(product.weighted_avg_cost_pkr) : "—"}</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">Stock &amp; cost are derived from received Purchase Orders, not edited here.</p>
          </div>

          {!form.made_to_order && (
            <div className="space-y-2">
              <Label htmlFor="low-stock-threshold">Low-stock threshold</Label>
              <Input
                id="low-stock-threshold"
                type="number"
                min={0}
                step={1}
                value={form.low_stock_threshold}
                placeholder={`Default (${globalThreshold})`}
                onChange={(e) => set("low_stock_threshold", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {form.low_stock_threshold.trim() === ""
                  ? `Following the catalogue default of ${globalThreshold}. Type a number to override it for this product only.`
                  : `Overriding the catalogue default of ${globalThreshold}. Clear the box to follow it again.`}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select value={form.visibility} onValueChange={(v) => set("visibility", v as ProductInput["visibility"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VIS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 pb-1 sm:col-span-2">
            <div className="flex flex-wrap items-end gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.published} disabled={!form.price_pkr.trim()} onCheckedChange={(c) => set("published", c)} /> Published
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.featured} onCheckedChange={(c) => set("featured", c)} /> Featured
              </label>
            </div>
            {!form.price_pkr.trim() && <p className="text-xs text-muted-foreground">Set a price to publish.</p>}
          </div>

          <div className="mt-1 border-t border-border pt-3 sm:col-span-2">
            <span className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Content &amp; media</span>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>MPN <span className="text-muted-foreground">(part #)</span></Label>
            <Input value={form.mpn} onChange={(e) => set("mpn", e.target.value)} placeholder="Manufacturer part #" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Short description</Label>
            <Input value={form.short_description} onChange={(e) => set("short_description", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>
          <div className="space-y-2 sm:col-span-2" id="field-meta_description">
            <Label>Meta description <span className="text-muted-foreground">(SEO · {form.meta_description.length}/160)</span></Label>
            <Textarea
              value={form.meta_description}
              onChange={(e) => set("meta_description", e.target.value.slice(0, 160))}
              rows={2}
              placeholder="Search-result snippet (falls back to the short description)"
            />
            {fieldErr("meta_description")}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Compatibility</Label>
            <Textarea value={form.compatibility} onChange={(e) => set("compatibility", e.target.value)} rows={2} placeholder="Compatible vehicles" />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Images</Label>
            <ImageUploader bucket="product-images" value={form.images} onChange={(v) => set("images", v)} max={8} prefix={form.sku || form.name} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Specs</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => set("specs", [...form.specs, { label: "", value: "" }])}>
                <Plus className="size-3.5" /> Add row
              </Button>
            </div>
            <div className="space-y-2">
              {form.specs.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={row.label}
                    placeholder="Label"
                    className="w-1/3"
                    onChange={(e) => set("specs", form.specs.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                  />
                  <Input
                    value={row.value}
                    placeholder="Value"
                    className="flex-1"
                    onChange={(e) => set("specs", form.specs.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => set("specs", form.specs.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4 text-[#cc0000]" />
                  </Button>
                </div>
              ))}
              {form.specs.length === 0 && <p className="text-xs text-muted-foreground">No specs yet.</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-[#cc0000] text-white hover:bg-[#a30000]"
            onClick={onSubmit}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : product ? "Save Changes" : "Create Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
