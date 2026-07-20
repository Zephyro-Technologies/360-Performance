// Investor catalogue — detailed P&L table (Investor tab, list view). Declares its columns and
// KPIs; <CatalogTable> handles grouping, subtotals, sorting, density, section headers, and export.
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { formatPKR } from "@360/lib/format";
import type { ProductListItem, ProductPnl, Category } from "../../data/catalog";
import { CatalogTable, money, int, pct, statusPill, statusLabel, dash, LOW_STOCK_ROW, type Col, type Kpi } from "./catalogTable";

interface InvRow {
  id: string; name: string; sku: string; group: string;
  cost: number; retail: number | null; reseller: number | null;
  received: number; onHand: number; qtySold: number;
  revRetail: number; revReseller: number; revenue: number; cogs: number; gp: number;
  vendor: string | null; status: string | null;
}

// Markup, not accounting margin: profit as a share of COST, matching the client's spreadsheet.
const markupVal = (price: number | null, cost: number) => (price != null && cost > 0 ? ((price - cost) / cost) * 100 : null);
const markupCell = (price: number | null, cost: number) => {
  const m = markupVal(price, cost);
  return m == null ? dash : <span className="tabular-nums text-muted-foreground">{m.toFixed(1)}%</span>;
};
// Profit per unit at retail — the rupee counterpart of the markup %.
const profitUnit = (r: InvRow) => (r.retail == null ? null : r.retail - r.cost);
const profitCell = (v: number | null) =>
  v == null ? dash : <span className={v < 0 ? "font-medium text-[#cc0000]" : "font-medium text-green-700"}>{money(v, { muteZero: false })}</span>;
const sum = (rows: InvRow[], f: (r: InvRow) => number) => rows.reduce((s, r) => s + f(r), 0);

const COLUMNS: Col<InvRow>[] = [
  { key: "name", label: "Item", group: "Item", align: "left", pinned: true, essential: true, sortVal: (r) => r.name,
    render: (r) => (<><span className="block max-w-[15rem] truncate">{r.name}</span><span className="font-mono text-[10px] text-muted-foreground tabular-nums">{r.sku}</span></>),
    csv: (r) => r.name },

  { key: "received", label: "Qty in\nStock", group: "Stock", align: "right", sortVal: (r) => r.received, render: (r) => int(r.received), total: (rs) => int(sum(rs, (r) => r.received), false), csv: (r) => r.received },
  { key: "onHand", label: "Remaining\nQuantity", group: "Stock", align: "right", essential: true, essentialOrder: 6, sortVal: (r) => r.onHand, render: (r) => int(r.onHand), total: (rs) => int(sum(rs, (r) => r.onHand), false), csv: (r) => r.onHand },

  { key: "cost", label: "Per Unit\nCost", group: "Cost", align: "right", essential: true, essentialOrder: 1, sortVal: (r) => r.cost, render: (r) => money(r.cost), csv: (r) => r.cost },

  { key: "retail", label: "Retail\nPrice", group: "Pricing", align: "right", essential: true, essentialOrder: 2, sortVal: (r) => r.retail, render: (r) => (r.retail == null ? dash : money(r.retail, { muteZero: false })), csv: (r) => r.retail ?? "" },
  { key: "reseller", label: "Reseller\nPrice", group: "Pricing", align: "right", essential: true, essentialOrder: 3, sortVal: (r) => r.reseller, render: (r) => (r.reseller == null ? dash : money(r.reseller, { muteZero: false })), csv: (r) => r.reseller ?? "" },
  // Same naming caveat as InHouseCatalogTable: "Profit Margin" here is profit ÷ COST (markup).
  { key: "mRetail", label: "Profit\nMargin", group: "Pricing", align: "right", essential: true, essentialOrder: 4, sortVal: (r) => markupVal(r.retail, r.cost), render: (r) => markupCell(r.retail, r.cost), csv: (r) => markupVal(r.retail, r.cost)?.toFixed(1) ?? "" },
  { key: "profitUnit", label: "Profit\n/Unit (PKR)", group: "Pricing", align: "right", essential: true, essentialOrder: 5, sortVal: profitUnit, render: (r) => profitCell(profitUnit(r)), csv: (r) => profitUnit(r) ?? "" },
  { key: "mReseller", label: "Markup\n(Reseller)", group: "Pricing", align: "right", sortVal: (r) => markupVal(r.reseller, r.cost), render: (r) => markupCell(r.reseller, r.cost), csv: (r) => markupVal(r.reseller, r.cost)?.toFixed(1) ?? "" },

  { key: "qtySold", label: "Qty\nSold", group: "Sales", align: "right", sortVal: (r) => r.qtySold, render: (r) => int(r.qtySold), total: (rs) => int(sum(rs, (r) => r.qtySold), false), csv: (r) => r.qtySold },
  { key: "revRetail", label: "Revenue\nRetail", group: "Sales", align: "right", sortVal: (r) => r.revRetail, render: (r) => money(r.revRetail), total: (rs) => money(sum(rs, (r) => r.revRetail), { strong: true }), csv: (r) => r.revRetail },
  { key: "revReseller", label: "Revenue\nReseller", group: "Sales", align: "right", sortVal: (r) => r.revReseller, render: (r) => money(r.revReseller), total: (rs) => money(sum(rs, (r) => r.revReseller), { strong: true }), csv: (r) => r.revReseller },
  { key: "cogs", label: "COGS\nSold", group: "Sales", align: "right", sortVal: (r) => r.cogs, render: (r) => money(r.cogs), total: (rs) => money(sum(rs, (r) => r.cogs), { strong: true }), csv: (r) => r.cogs },
  { key: "gp", label: "Gross\nProfit", group: "Sales", align: "right", sortVal: (r) => r.gp,
    render: (r) => <span className={r.gp < 0 ? "font-medium text-[#cc0000]" : r.gp > 0 ? "font-medium text-green-700" : ""}>{money(r.gp)}</span>,
    total: (rs) => { const g = sum(rs, (r) => r.gp); return <span className={g < 0 ? "text-[#cc0000]" : ""}>{money(g, { strong: true })}</span>; }, csv: (r) => r.gp },
  { key: "margin", label: "GP\nMargin %", group: "Sales", align: "right", sortVal: (r) => (r.revenue > 0 ? r.gp / r.revenue : null),
    render: (r) => pct(r.gp, r.revenue, (p) => (p < 0 ? "text-[#cc0000]" : p >= 25 ? "text-green-700" : "")),
    total: (rs) => pct(sum(rs, (r) => r.gp), sum(rs, (r) => r.revenue)), csv: (r) => (r.revenue > 0 ? ((r.gp / r.revenue) * 100).toFixed(1) : "") },

  { key: "vendor", label: "Vendor", group: "Supply", align: "left", sortVal: (r) => r.vendor, render: (r) => <span className="block max-w-[10rem] truncate text-muted-foreground">{r.vendor ?? dash}</span>, csv: (r) => r.vendor ?? "" },
  { key: "status", label: "Status", group: "Supply", align: "left", sortVal: (r) => statusLabel(r.status), render: (r) => statusPill(r.status), csv: (r) => statusLabel(r.status) },
];

export function InvestorCatalogTable({ products, pnl, categories, lowStock }: { products: ProductListItem[]; pnl: Record<string, ProductPnl>; categories: Category[]; lowStock?: (id: string) => boolean }) {
  const navigate = useNavigate();
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const rows = useMemo<InvRow[]>(() => {
    const groupOf = (p: ProductListItem) => {
      const leaf = p.category_id ? catById.get(p.category_id) : undefined;
      if (!leaf) return "Uncategorized";
      const parent = leaf.parent_id ? catById.get(leaf.parent_id) : undefined;
      return parent?.name ?? leaf.name;
    };
    return products.map((p) => {
      const e = pnl[p.id];
      const revRetail = e?.revenue_retail_pkr ?? 0;
      const revReseller = e?.revenue_reseller_pkr ?? 0;
      const revenue = revRetail + revReseller;
      const cogs = e?.cogs_sold_pkr ?? 0;
      return {
        id: p.id, name: p.name, sku: p.sku, group: groupOf(p),
        cost: e?.landed_cost_unit_pkr ?? 0, retail: p.price_pkr, reseller: p.reseller_price_pkr,
        received: e?.received_qty ?? 0, onHand: e?.on_hand_qty ?? 0, qtySold: e?.qty_sold ?? 0,
        revRetail, revReseller, revenue, cogs, gp: revenue - cogs,
        vendor: e?.vendor_name ?? null, status: e?.po_status ?? null,
      };
    });
  }, [products, pnl, catById]);

  const kpis = useMemo<Kpi[]>(() => {
    const rev = rows.reduce((s, r) => s + r.revenue, 0);
    const gp = rows.reduce((s, r) => s + r.gp, 0);
    const landed = rows.reduce((s, r) => s + r.onHand * r.cost, 0);
    const remaining = rows.reduce((s, r) => s + r.onHand, 0);
    return [
      { label: "Sold revenue", value: formatPKR(rev) },
      { label: "Gross profit", value: formatPKR(gp), tone: gp < 0 ? "bad" : "good" },
      { label: "GP margin", value: rev > 0 ? `${((gp / rev) * 100).toFixed(1)}%` : "—" },
      { label: "Units remaining", value: String(remaining) },
      { label: "Landed value in stock", value: formatPKR(landed) },
    ];
  }, [rows]);

  return (
    <CatalogTable
      rows={rows}
      columns={COLUMNS}
      groupBy={(r) => r.group}
      rowKey={(r) => r.id}
      rowClass={(r) => (lowStock?.(r.id) ? LOW_STOCK_ROW : "")}
      onRowClick={(r) => navigate(`/products/${r.id}`)}
      kpis={kpis}
      unit="item"
    />
  );
}
