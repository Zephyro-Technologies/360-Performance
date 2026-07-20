// Module 6 — Product Catalogue (DB-backed via React Query). Grid/table, search,
// parent-grouped category filter, inline price edit, add/edit/delete (role-gated).
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { LayoutGrid, List, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/common/PageHeader";
import { ProductDialog } from "../components/products/ProductDialog";
import { InvestorCatalogTable } from "../components/products/InvestorCatalogTable";
import { InHouseCatalogTable } from "../components/products/InHouseCatalogTable";
import { useOpenOnNewParam } from "../lib/useOpenOnNewParam";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import {
  useProducts,
  useProductPnl,
  usePurchaseLineDetail,
  useCategories,
  useDeleteProduct,
  useUpdateProductPrice,
  groupCategories,
  useSuppliers,
  type ProductListItem,
} from "../data/catalog";
import { LowStockControl, useHighlightLowStock } from "../components/products/LowStockControl";
import { LOW_STOCK_ROW } from "../components/products/catalogTable";
import { CatalogSearchResults } from "../components/products/CatalogSearchResults";
import { searchCatalog } from "../components/products/catalogSearch";
import { imageUrl } from "../data/storage";
import { useAuth } from "../data/auth";
import { formatPKR } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@360/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@360/ui/tabs";
import { useTableSort, SortHead } from "../components/common/useTableSort";
import { OneoffProductsTable } from "../components/products/OneoffProductsTable";
import { OneoffProductDialog } from "../components/products/OneoffProductDialog";
import { useOneoffProducts, type OneoffProduct } from "../data/oneoffProducts";

type Owner = "house" | "investor" | "oneoff";

const AVAIL_LABEL: Record<string, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  made_to_order: "Made to Order",
  out_of_stock: "Out of Stock",
};
const AVAIL_STYLE: Record<string, string> = {
  in_stock: "text-green-700 bg-green-50 border-green-200",
  low_stock: "text-amber-700 bg-amber-50 border-amber-200",
  made_to_order: "text-blue-700 bg-blue-50 border-blue-200",
  out_of_stock: "text-muted-foreground bg-muted border-border",
};

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

// Price with the sale strikethrough — same rule as the storefront (sale shown only
// when strictly below the regular price), so admin and web agree.
function PriceInline({ price, sale }: { price: number; sale: number | null }) {
  if (sale != null && sale < price) {
    return (
      <>
        <span className="text-[#cc0000]">{formatPKR(sale)}</span>{" "}
        <span className="text-xs font-normal text-muted-foreground line-through">{formatPKR(price)}</span>
      </>
    );
  }
  return <>{formatPKR(price)}</>;
}

// One status that folds published + visibility together: a product is only truly on
// the storefront when published AND visibility==='visible' (the products_public gate).
const STATUS = {
  draft: { label: "Draft", table: "bg-muted text-muted-foreground border-border", grid: "bg-black/70 text-white border-black" },
  hidden: { label: "Hidden", table: "border-amber-200 bg-amber-50 text-amber-700", grid: "bg-amber-600/90 text-white border-amber-700" },
  archived: { label: "Archived", table: "border-amber-200 bg-amber-50 text-amber-700", grid: "bg-amber-600/90 text-white border-amber-700" },
  published: { label: "Published", table: "border-green-200 bg-green-50 text-green-700", grid: "" },
} as const;
function productStatus(p: ProductListItem): keyof typeof STATUS {
  if (!p.published) return "draft";
  if (p.visibility === "archived") return "archived";
  if (p.visibility !== "visible") return "hidden";
  return "published";
}
function StatusBadge({ p, grid }: { p: ProductListItem; grid?: boolean }) {
  const s = productStatus(p);
  if (grid && s === "published") return null; // keep the grid clean — only flag not-live
  return <Badge className={grid ? STATUS[s].grid : STATUS[s].table}>{STATUS[s].label}</Badge>;
}

export function Products() {
  const productsQ = useProducts();
  const pnlQ = useProductPnl(); // per-product economics for the Investor list view
  const linesQ = usePurchaseLineDetail(); // per-purchase cost rows for the In-House list view
  const categoriesQ = useCategories();
  const del = useDeleteProduct();
  const updatePrice = useUpdateProductPrice();
  const { can } = useAuth();
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [owner, setOwner] = useState<Owner>("house"); // In-house vs investor stock tabs
  const [cat, setCat] = useState<string>("all");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [editing, setEditing] = useState<ProductListItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState<{ id: string; value: string } | null>(null);
  const [oneoffEdit, setOneoffEdit] = useState<OneoffProduct | null>(null);
  const [oneoffOpen, setOneoffOpen] = useState(false);
  const oneoffQ = useOneoffProducts();
  const suppliersQ = useSuppliers(); // one-off vendor names, for the cross-tab search
  const oneoffCount = oneoffQ.data?.length ?? 0;
  useOpenOnNewParam(() => { setEditing(null); setDialogOpen(true); }); // topbar "+ New → Product"

  const groups = useMemo(() => groupCategories(categoriesQ.data ?? []), [categoriesQ.data]);

  // Show the same Parent › Leaf rollup the detail page uses (the list otherwise shows
  // only the leaf name, which is ambiguous for generic leaves like "Kits").
  const catName = (p: ProductListItem) => {
    const leaf = p.categories?.name;
    if (!leaf) return "—";
    const parent = p.categories?.parent_id ? categoriesQ.data?.find((c) => c.id === p.categories!.parent_id)?.name : null;
    return parent ? `${parent} › ${leaf}` : leaf;
  };

  // In-House list view is per-purchase (PO lines), filtered by the same search + category.
  const filteredLines = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (linesQ.data ?? []).filter((r) => {
      const vendor = r.vendor_name?.toLowerCase() ?? "";
      const matchQ = !term || r.product_name.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term) || vendor.includes(term);
      const matchCat = cat === "all" || r.category_id === cat;
      return matchQ && matchCat;
    });
  }, [linesQ.data, q, cat]);

  // Catalogue-wide matches (all three tabs at once) — see components/products/catalogSearch.ts.
  const searchHits = useMemo(
    () =>
      searchCatalog(q, {
        products: productsQ.data ?? [],
        oneoffs: oneoffQ.data ?? [],
        categoryName: (p) => p.categories?.name ?? null,
        vendorForProduct: (p) => pnlQ.data?.[p.id]?.vendor_name ?? null,
        vendorForOneoff: (o) => suppliersQ.data?.find((s) => s.id === o.supplier_id)?.name ?? null,
      }),
    [q, productsQ.data, oneoffQ.data, pnlQ.data, suppliersQ.data],
  );

  // Low-stock highlighting. `availability` is server-derived (override → house default), so the
  // client never re-implements the threshold comparison — it just reads the enum.
  const [highlightLow, setHighlightLow] = useHighlightLowStock();
  const lowStockById = useMemo(
    () => new Map((productsQ.data ?? []).map((p) => [p.id, p.availability === "low_stock" || p.availability === "out_of_stock"])),
    [productsQ.data],
  );
  const houseCount = useMemo(() => (productsQ.data ?? []).filter((p) => p.owner_kind !== "investor").length, [productsQ.data]);
  const investorCount = useMemo(() => (productsQ.data ?? []).filter((p) => p.owner_kind === "investor").length, [productsQ.data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (productsQ.data ?? []).filter((p) => {
      const matchOwner = owner === "investor" ? p.owner_kind === "investor" : p.owner_kind !== "investor";
      const vendor = pnlQ.data?.[p.id]?.vendor_name?.toLowerCase() ?? "";
      const matchQ = !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || vendor.includes(term);
      const matchCat = cat === "all" || p.category_id === cat;
      return matchOwner && matchQ && matchCat;
    });
  }, [productsQ.data, pnlQ.data, owner, q, cat]);

  // Counted over the visible rows, so the badge tracks the active tab + filters.
  const lowStockCount = useMemo(() => rows.filter((p) => lowStockById.get(p.id)).length, [rows, lowStockById]);

  // Sort applies only to the plain table view; the grid and CatalogTable branches use `rows` as-is.
  const tableSort = useTableSort(
    rows,
    {
      product: (p) => p.name,
      category: (p) => catName(p),
      availability: (p) => p.availability,
      status: (p) => productStatus(p),
      price: (p) => p.price_pkr,
    },
    "product",
    "asc",
  );

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(p: ProductListItem) {
    setEditing(p);
    setDialogOpen(true);
  }
  async function remove(p: ProductListItem) {
    if (!confirm(`Delete ${p.name}?`)) return;
    try {
      await del.mutateAsync(p.id);
      toast.success("Product deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }
  async function commitPrice(p: ProductListItem) {
    if (!priceDraft) return;
    const value = Number(priceDraft.value);
    setPriceDraft(null);
    if (!Number.isFinite(value) || value < 0 || value === p.price_pkr) return;
    if (p.sale_price_pkr != null && value < p.sale_price_pkr) {
      toast.error(`Price can't be below the sale price (${formatPKR(p.sale_price_pkr)}). Lower the sale price in the editor first.`);
      return;
    }
    try {
      await updatePrice.mutateAsync({ id: p.id, price_pkr: value });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update price");
    }
  }

  return (
    <div>
      <PageHeader
        title="Product Catalogue"
        subtitle="Manage products shown on the public website"
        actions={
          can("edit") && (
            owner === "oneoff" ? (
              <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => { setOneoffEdit(null); setOneoffOpen(true); }}>
                <Plus className="size-4" /> New one-off product
              </Button>
            ) : (
              <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={openNew}>
                <Plus className="size-4" /> New Product
              </Button>
            )
          )
        }
      />

      {/* In-house vs investor stock — the two are owned separately, so keep them on separate tabs. */}
      <Tabs value={owner} onValueChange={(v) => setOwner(v as Owner)} className="mb-4 w-full">
        <TabsList className="h-12 w-full">
          <TabsTrigger value="house" className="text-base font-medium">In House{houseCount > 0 && <span className="ml-2 rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{houseCount}</span>}</TabsTrigger>
          <TabsTrigger value="investor" className="text-base font-medium">Investor{investorCount > 0 && <span className="ml-2 rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{investorCount}</span>}</TabsTrigger>
          <TabsTrigger value="oneoff" className="text-base font-medium">One-off{oneoffCount > 0 && <span className="ml-2 rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{oneoffCount}</span>}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search the whole catalogue — product, SKU, vendor, category, brand, OEM #…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        {owner !== "oneoff" && (
          <>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {groups.map((g) => (
                  <SelectGroup key={g.parent?.id ?? g.leaves[0]?.id}>
                    <SelectLabel>{g.parent?.name ?? "Standalone"}</SelectLabel>
                    {g.leaves.map((leaf) => (
                      <SelectItem key={leaf.id} value={leaf.id}>{leaf.name}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <LowStockControl on={highlightLow} onToggle={setHighlightLow} canManage={can("manage")} lowCount={lowStockCount} />
            <div className="flex rounded-md border border-border">
              <Button variant={view === "grid" ? "default" : "ghost"} size="icon" className="rounded-r-none" onClick={() => setView("grid")} aria-label="Grid view">
                <LayoutGrid className="size-4" />
              </Button>
              <Button variant={view === "table" ? "default" : "ghost"} size="icon" className="rounded-l-none" onClick={() => setView("table")} aria-label="Table view">
                <List className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Cross-tab results: the filtered views below are scoped to the active tab, so without this
          a match in another tab is invisible. Sits above them rather than replacing them, so the
          rich per-tab cost tables keep working while you search. */}
      {q.trim() && (
        <div className="mb-4">
          <CatalogSearchResults term={q} hits={searchHits} activeTab={owner} onJump={setOwner} />
        </div>
      )}

      {owner === "oneoff" ? (
        <OneoffProductsTable query={q} onEdit={(p) => { setOneoffEdit(p); setOneoffOpen(true); }} />
      ) : productsQ.isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Loading products…</p>
      ) : productsQ.isError ? (
        <p className="py-16 text-center text-[#cc0000]">{(productsQ.error as Error).message}</p>
      ) : owner === "investor" && view === "table" ? (
        <InvestorCatalogTable products={rows} pnl={pnlQ.data ?? {}} categories={categoriesQ.data ?? []} lowStock={highlightLow ? (id) => !!lowStockById.get(id) : undefined} />
      ) : owner === "house" && view === "table" ? (
        <InHouseCatalogTable lines={filteredLines} categories={categoriesQ.data ?? []} lowStock={highlightLow ? (id) => !!lowStockById.get(id) : undefined} />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/products/${p.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/products/${p.id}`);
                }
              }}
              className="group flex cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cc0000]/40 motion-reduce:transition-none"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
                <ImageWithFallback src={imageUrl("product-images", p.images[0])} alt={p.name} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <span className="absolute left-2 top-2"><Badge className={AVAIL_STYLE[p.availability]}>{AVAIL_LABEL[p.availability]}</Badge></span>
                {productStatus(p) !== "published" && <span className="absolute right-2 top-2"><StatusBadge p={p} grid /></span>}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">{catName(p)}</p>
                  <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">{p.sku}</span>
                </div>
                <h4 className="mt-1 line-clamp-2">{p.name}</h4>
                {p.brand && <p className="mt-0.5 text-xs text-muted-foreground">{p.brand}</p>}
                {p.owner_kind === "investor" && <span className="mt-1 inline-flex w-fit items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">Investor-owned</span>}
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="[font-family:var(--font-heading)] text-lg font-bold tabular-nums">
                    {p.price_pkr === null ? <span className="text-sm text-muted-foreground">No price</span> : <PriceInline price={p.price_pkr} sale={p.sale_price_pkr} />}
                  </span>
                  {can("edit") && (
                    <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                      {can("delete") && <Button variant="ghost" size="icon" className="size-8" onClick={() => remove(p)}><Trash2 className="size-4 text-[#cc0000]" /></Button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-black hover:bg-black">
                <SortHead label="Product" sortKey="product" sort={tableSort} className="text-white" />
                <SortHead label="Category" sortKey="category" sort={tableSort} className="text-white" />
                <SortHead label="Availability" sortKey="availability" sort={tableSort} className="text-white" />
                <SortHead label="Status" sortKey="status" sort={tableSort} className="text-white" />
                <SortHead label="Price" sortKey="price" sort={tableSort} className="text-right text-white" align="right" />
                {can("edit") && <TableHead className="w-20 text-white" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableSort.sorted.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn("cursor-pointer", highlightLow && lowStockById.get(p.id) && LOW_STOCK_ROW)}
                  onClick={() => navigate(`/products/${p.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ImageWithFallback src={imageUrl("product-images", p.images[0])} alt={p.name} className="size-10 rounded-sm object-cover" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{p.sku}{p.owner_kind === "investor" && <span className="ml-2 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 text-[10px] font-medium text-violet-700">Investor</span>}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{catName(p)}</TableCell>
                  <TableCell><Badge className={AVAIL_STYLE[p.availability]}>{AVAIL_LABEL[p.availability]}</Badge></TableCell>
                  <TableCell><StatusBadge p={p} /></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {can("edit") && priceDraft?.id === p.id ? (
                      <Input
                        autoFocus
                        type="number"
                        value={priceDraft.value}
                        onChange={(e) => setPriceDraft({ id: p.id, value: e.target.value })}
                        onBlur={() => commitPrice(p)}
                        onKeyDown={(e) => e.key === "Enter" && commitPrice(p)}
                        className="ml-auto h-8 w-28"
                      />
                    ) : (
                      <button
                        className={cn("tabular-nums", can("edit") && "hover:underline")}
                        onClick={() => can("edit") && setPriceDraft({ id: p.id, value: p.price_pkr === null ? "" : String(p.price_pkr) })}
                      >
                        {p.price_pkr === null ? "—" : <PriceInline price={p.price_pkr} sale={p.sale_price_pkr} />}
                      </button>
                    )}
                  </TableCell>
                  {can("edit") && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                        {can("delete") && <Button variant="ghost" size="icon" className="size-8" onClick={() => remove(p)}><Trash2 className="size-4 text-[#cc0000]" /></Button>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!productsQ.isLoading && !productsQ.isError && rows.length === 0 && view !== "table" && (
        <p className="py-16 text-center text-muted-foreground">No products match your filters.</p>
      )}

      <ProductDialog product={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
      <OneoffProductDialog product={oneoffEdit} open={oneoffOpen} onOpenChange={(o) => { setOneoffOpen(o); if (!o) setOneoffEdit(null); }} />
    </div>
  );
}
