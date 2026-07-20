// In-House catalogue — detailed purchase/cost table (In-House tab, list view). One row per
// purchase (PO line). Declares columns + KPIs; <CatalogTable> handles the rest. Unpaid item/ship
// cells are tinted amber and rolled into the "Outstanding payable" KPI.
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { formatPKR } from "@360/lib/format";
import type { PurchaseLineDetail, Category } from "../../data/catalog";
import { CatalogTable, money, int, statusPill, statusLabel, date, dash, LOW_STOCK_ROW, type Col, type Kpi } from "./catalogTable";

type Row = PurchaseLineDetail;
const totalCost = (r: Row) => r.qty_ordered * r.unit_cost_pkr;
const shipTotal = (r: Row) => r.qty_ordered * r.shipping_per_unit_pkr;
const remaining = (r: Row) => r.qty_ordered - r.qty_sold - r.qty_pr;
const itemPaid = (r: Row) => r.item_paid_amount_pkr ?? 0;
const shipPaid = (r: Row) => r.ship_paid_amount_pkr ?? 0;
const totalPaid = (r: Row) => itemPaid(r) + shipPaid(r);
const owed = (r: Row) => Math.max(0, totalCost(r) + shipTotal(r) - totalPaid(r));
const itemPaidFlag = (r: Row) => (r.item_paid_amount_pkr ?? 0) > 0 || r.item_paid_on != null;
const shipPaidFlag = (r: Row) => (r.ship_paid_amount_pkr ?? 0) > 0 || r.ship_paid_on != null;
// Markup, not accounting margin: profit as a share of COST, matching the client's spreadsheet.
const markupVal = (price: number | null, cost: number) => (price != null && cost > 0 ? ((price - cost) / cost) * 100 : null);
const markupCell = (price: number | null, cost: number) => {
  const m = markupVal(price, cost);
  return m == null ? dash : <span className="tabular-nums text-muted-foreground">{m.toFixed(1)}%</span>;
};
// Profit per unit at retail — the rupee counterpart of the markup %.
const profitUnit = (r: Row) => (r.retail_pkr == null ? null : r.retail_pkr - r.landed_cost_per_unit_pkr);
const profitCell = (v: number | null) =>
  v == null ? dash : <span className={v < 0 ? "font-medium text-[#cc0000]" : "font-medium text-green-700"}>{money(v, { muteZero: false })}</span>;
const paidCell = (on: boolean) => <span className={on ? "text-xs font-medium text-green-700" : "text-xs font-medium text-amber-700"}>{on ? "Yes" : "No"}</span>;
const unpaidTint = (on: boolean) => (on ? "" : "bg-amber-50");
const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
// The purchase currency: goods are bought from the vendor in RMB and converted at the rate
// frozen on that PO — unit_cost_rmb × frozen_rate_rmb_pkr = the PKR unit cost beside it.
const RMB_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const rmbCell = (v: number | null) =>
  v == null ? dash : <span className="tabular-nums">¥{RMB_FMT.format(v)}</span>;
const rateCell = (v: number | null) =>
  v == null ? dash : <span className="tabular-nums text-muted-foreground">{RMB_FMT.format(v)}</span>;

const COLUMNS: Col<Row>[] = [
  { key: "name", label: "Item", group: "Item", align: "left", pinned: true, essential: true, sortVal: (r) => r.product_name,
    render: (r) => (<><span className="block max-w-[15rem] truncate">{r.product_name}</span><span className="font-mono text-[10px] text-muted-foreground tabular-nums">{r.sku}</span></>), csv: (r) => r.product_name },

  { key: "qty", label: "Qty", group: "Cost", align: "right", sortVal: (r) => r.qty_ordered, render: (r) => int(r.qty_ordered), total: (rs) => int(sum(rs, (r) => r.qty_ordered), false), csv: (r) => r.qty_ordered },
  // Full view only — the Essentials preset is Hamid's locked six-figure list (see catalogTable.test).
  { key: "unitCostRmb", label: "Unit Cost\n(RMB)", group: "Cost", align: "right", sortVal: (r) => r.unit_cost_rmb, render: (r) => rmbCell(r.unit_cost_rmb), csv: (r) => r.unit_cost_rmb ?? "" },
  { key: "rmbRate", label: "RMB Rate\n(PKR per ¥1)", group: "Cost", align: "right", sortVal: (r) => r.frozen_rate_rmb_pkr, render: (r) => rateCell(r.frozen_rate_rmb_pkr), csv: (r) => r.frozen_rate_rmb_pkr ?? "" },
  { key: "unitCost", label: "Unit Cost\n(PKR)", group: "Cost", align: "right", sortVal: (r) => r.unit_cost_pkr, render: (r) => money(r.unit_cost_pkr), csv: (r) => r.unit_cost_pkr },
  { key: "totalCost", label: "Total Cost\n(PKR)", group: "Cost", align: "right", sortVal: totalCost, render: (r) => money(totalCost(r)), total: (rs) => money(sum(rs, totalCost), { strong: true }), csv: totalCost },
  { key: "shipUnit", label: "Shipping\n/Unit", group: "Cost", align: "right", sortVal: (r) => r.shipping_per_unit_pkr, render: (r) => money(r.shipping_per_unit_pkr), csv: (r) => r.shipping_per_unit_pkr },
  { key: "shipTotal", label: "Shipping\nTotal", group: "Cost", align: "right", sortVal: shipTotal, render: (r) => money(shipTotal(r)), total: (rs) => money(sum(rs, shipTotal), { strong: true }), csv: shipTotal },
  { key: "pkg", label: "Pkg & Brand\n/Unit", group: "Cost", align: "right", sortVal: (r) => r.packaging_per_unit_pkr, render: (r) => money(r.packaging_per_unit_pkr), csv: (r) => r.packaging_per_unit_pkr },
  { key: "landedUnit", label: "Per Unit\nCost", group: "Cost", align: "right", essential: true, essentialOrder: 1, sortVal: (r) => r.landed_cost_per_unit_pkr, render: (r) => money(r.landed_cost_per_unit_pkr, { strong: true }), csv: (r) => r.landed_cost_per_unit_pkr },
  { key: "landedTotal", label: "Landed\nTotal", group: "Cost", align: "right", sortVal: (r) => r.landed_total_pkr, render: (r) => money(r.landed_total_pkr), total: (rs) => money(sum(rs, (r) => r.landed_total_pkr), { strong: true }), csv: (r) => r.landed_total_pkr },

  { key: "retail", label: "Retail\nPrice", group: "Pricing", align: "right", essential: true, essentialOrder: 2, sortVal: (r) => r.retail_pkr, render: (r) => (r.retail_pkr == null ? dash : money(r.retail_pkr, { muteZero: false })), csv: (r) => r.retail_pkr ?? "" },
  { key: "reseller", label: "Reseller\nPrice", group: "Pricing", align: "right", essential: true, essentialOrder: 3, sortVal: (r) => r.reseller_pkr, render: (r) => (r.reseller_pkr == null ? dash : money(r.reseller_pkr, { muteZero: false })), csv: (r) => r.reseller_pkr ?? "" },
  // NOTE: the client asked for this column to be named "Profit Margin" (locked by
  // catalogTable.test.tsx), but markupVal computes profit ÷ COST — a markup, not an accounting
  // margin. ProductDetail shows profit ÷ PRICE under "Margin", so the same product reads 50.0%
  // here and 33.3% there. Formula left alone pending the client's ruling on which they want.
  { key: "mRetail", label: "Profit\nMargin", group: "Pricing", align: "right", essential: true, essentialOrder: 4, sortVal: (r) => markupVal(r.retail_pkr, r.landed_cost_per_unit_pkr), render: (r) => markupCell(r.retail_pkr, r.landed_cost_per_unit_pkr), csv: (r) => markupVal(r.retail_pkr, r.landed_cost_per_unit_pkr)?.toFixed(1) ?? "" },
  { key: "profitUnit", label: "Profit\n/Unit (PKR)", group: "Pricing", align: "right", essential: true, essentialOrder: 5, sortVal: profitUnit, render: (r) => profitCell(profitUnit(r)), csv: (r) => profitUnit(r) ?? "" },
  { key: "mReseller", label: "Markup\nReseller", group: "Pricing", align: "right", sortVal: (r) => markupVal(r.reseller_pkr, r.landed_cost_per_unit_pkr), render: (r) => markupCell(r.reseller_pkr, r.landed_cost_per_unit_pkr), csv: (r) => markupVal(r.reseller_pkr, r.landed_cost_per_unit_pkr)?.toFixed(1) ?? "" },

  { key: "sold", label: "Qty\nSold", group: "Sales", align: "right", sortVal: (r) => r.qty_sold, render: (r) => int(r.qty_sold), total: (rs) => int(sum(rs, (r) => r.qty_sold), false), csv: (r) => r.qty_sold },
  { key: "pr", label: "Qty\nPR", group: "Sales", align: "right", sortVal: (r) => r.qty_pr, render: (r) => int(r.qty_pr), total: (rs) => int(sum(rs, (r) => r.qty_pr), false), csv: (r) => r.qty_pr },
  { key: "remaining", label: "Remaining\nQuantity", group: "Sales", align: "right", essential: true, essentialOrder: 6, sortVal: remaining, render: (r) => int(remaining(r)), total: (rs) => int(sum(rs, remaining), false), csv: remaining },

  { key: "itemPaidQ", label: "Item\nPaid?", group: "Payments", align: "center", sortVal: (r) => (itemPaidFlag(r) ? 1 : 0), render: (r) => paidCell(itemPaidFlag(r)), cellClass: (r) => unpaidTint(itemPaidFlag(r)), csv: (r) => (itemPaidFlag(r) ? "Yes" : "No") },
  { key: "shipPaidQ", label: "Ship\nPaid?", group: "Payments", align: "center", sortVal: (r) => (shipPaidFlag(r) ? 1 : 0), render: (r) => paidCell(shipPaidFlag(r)), cellClass: (r) => unpaidTint(shipPaidFlag(r)), csv: (r) => (shipPaidFlag(r) ? "Yes" : "No") },
  { key: "itemPaidAmt", label: "Item Paid\nAmt", group: "Payments", align: "right", sortVal: itemPaid, render: (r) => money(itemPaid(r)), total: (rs) => money(sum(rs, itemPaid), { strong: true }), csv: itemPaid },
  { key: "shipPaidAmt", label: "Ship Paid\nAmt", group: "Payments", align: "right", sortVal: shipPaid, render: (r) => money(shipPaid(r)), total: (rs) => money(sum(rs, shipPaid), { strong: true }), csv: shipPaid },
  { key: "totalPaid", label: "Total\nPaid", group: "Payments", align: "right", sortVal: totalPaid, render: (r) => money(totalPaid(r), { strong: true }), total: (rs) => money(sum(rs, totalPaid), { strong: true }), csv: totalPaid },
  { key: "itemPaidOn", label: "Item Paid\nDate", group: "Payments", align: "left", sortVal: (r) => r.item_paid_on, render: (r) => date(r.item_paid_on), csv: (r) => r.item_paid_on ?? "" },
  { key: "shipPaidOn", label: "Ship Paid\nDate", group: "Payments", align: "left", sortVal: (r) => r.ship_paid_on, render: (r) => date(r.ship_paid_on), csv: (r) => r.ship_paid_on ?? "" },

  { key: "vendor", label: "Vendor", group: "Supply", align: "left", sortVal: (r) => r.vendor_name, render: (r) => <span className="block max-w-[10rem] truncate text-muted-foreground">{r.vendor_name ?? dash}</span>, csv: (r) => r.vendor_name ?? "" },
  { key: "status", label: "Status", group: "Supply", align: "left",
    sortVal: (r) => (r.line_id == null ? "Not ordered" : statusLabel(r.po_status)),
    render: (r) => (r.line_id == null ? <span className="text-xs text-muted-foreground">Not ordered</span> : statusPill(r.po_status)),
    csv: (r) => (r.line_id == null ? "Not ordered" : statusLabel(r.po_status)) },
];

export function InHouseCatalogTable({ lines, categories, lowStock }: { lines: PurchaseLineDetail[]; categories: Category[]; lowStock?: (productId: string) => boolean }) {
  const navigate = useNavigate();
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groupOf = (r: Row) => {
    const leaf = r.category_id ? catById.get(r.category_id) : undefined;
    if (!leaf) return "Uncategorized";
    const parent = leaf.parent_id ? catById.get(leaf.parent_id) : undefined;
    return parent?.name ?? leaf.name;
  };

  const kpis = useMemo<Kpi[]>(() => {
    const landed = sum(lines, (r) => r.landed_total_pkr);
    const paid = sum(lines, totalPaid);
    const payable = sum(lines, owed);
    const inventoryValue = sum(lines, (r) => remaining(r) * r.landed_cost_per_unit_pkr);
    return [
      { label: "Landed cost", value: formatPKR(landed) },
      { label: "Paid", value: formatPKR(paid), tone: "good" },
      { label: "Outstanding payable", value: formatPKR(payable), tone: payable > 0 ? "warn" : "default" },
      { label: "Units in stock", value: String(sum(lines, remaining)) },
      { label: "Inventory value", value: formatPKR(inventoryValue) },
      { label: "Units sold", value: String(sum(lines, (r) => r.qty_sold)) },
    ];
  }, [lines]);

  return (
    <CatalogTable
      rows={lines}
      columns={COLUMNS}
      groupBy={groupOf}
      rowKey={(r) => r.line_id ?? r.product_id}
      rowClass={(r) => (lowStock?.(r.product_id) ? LOW_STOCK_ROW : "")}
      onRowClick={(r) => navigate(`/products/${r.product_id}`)}
      kpis={kpis}
      unit="purchase"
    />
  );
}
