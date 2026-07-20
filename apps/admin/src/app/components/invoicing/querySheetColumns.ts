// Column model for a query sheet — the same 28 headers, order and section grouping as the In-House
// catalogue table (components/products/InHouseCatalogTable.tsx), so the rough sheet reads exactly
// like the catalogue the operator already knows.
//
// The split that matters: INPUT columns are typed by hand and stored in the row's `cells` jsonb;
// DERIVED columns are computed here and never stored. The formulas below are deliberately the same
// arithmetic as the catalogue's (landed = unit + shipping + packaging; markup is profit over COST,
// not over price), so a sheet and the catalogue can't quietly disagree.

export type CellKind = "text" | "number" | "date";

export interface SheetCol {
  key: string;
  label: string; // may contain "\n" for a two-line header, as in the catalogue
  group: string;
  align: "left" | "right" | "center";
  kind: CellKind;
  derived?: (r: SheetCells) => number | string | null; // set ⇒ read-only, computed
  pinned?: boolean;
  money?: boolean;
  percent?: boolean;
  total?: boolean; // summed in the footer / subtotal rows
}

export type SheetCells = Record<string, string | number | null>;

const n = (r: SheetCells, k: string): number => {
  const v = r[k];
  return typeof v === "number" ? v : v == null || v === "" ? 0 : Number(v) || 0;
};
// Blank (not 0) when the operator hasn't priced it yet — a real 0 retail is different from "unset".
const opt = (r: SheetCells, k: string): number | null => {
  const v = r[k];
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export const unitCost = (r: SheetCells) => n(r, "unitCostRmb") * n(r, "rmbRate");
export const landedUnit = (r: SheetCells) => unitCost(r) + n(r, "shipUnit") + n(r, "pkg");
const markup = (price: number | null, cost: number) => (price != null && cost > 0 ? ((price - cost) / cost) * 100 : null);

export const COLUMNS: SheetCol[] = [
  { key: "name", label: "Item", group: "Item", align: "left", kind: "text", pinned: true },

  { key: "qty", label: "Qty", group: "Cost", align: "right", kind: "number", total: true },
  { key: "unitCostRmb", label: "Unit Cost\n(RMB)", group: "Cost", align: "right", kind: "number" },
  { key: "rmbRate", label: "RMB Rate\n(PKR per ¥1)", group: "Cost", align: "right", kind: "number" },
  { key: "unitCost", label: "Unit Cost\n(PKR)", group: "Cost", align: "right", kind: "number", money: true, derived: unitCost },
  { key: "totalCost", label: "Total Cost\n(PKR)", group: "Cost", align: "right", kind: "number", money: true, total: true, derived: (r) => n(r, "qty") * unitCost(r) },
  { key: "shipUnit", label: "Shipping\n/Unit", group: "Cost", align: "right", kind: "number", money: true },
  { key: "shipTotal", label: "Shipping\nTotal", group: "Cost", align: "right", kind: "number", money: true, total: true, derived: (r) => n(r, "qty") * n(r, "shipUnit") },
  { key: "pkg", label: "Pkg & Brand\n/Unit", group: "Cost", align: "right", kind: "number", money: true },
  { key: "landedUnit", label: "Per Unit\nCost", group: "Cost", align: "right", kind: "number", money: true, derived: landedUnit },
  { key: "landedTotal", label: "Landed\nTotal", group: "Cost", align: "right", kind: "number", money: true, total: true, derived: (r) => landedUnit(r) * n(r, "qty") },

  { key: "retail", label: "Retail\nPrice", group: "Pricing", align: "right", kind: "number", money: true },
  { key: "reseller", label: "Reseller\nPrice", group: "Pricing", align: "right", kind: "number", money: true },
  { key: "mRetail", label: "Profit\nMargin", group: "Pricing", align: "right", kind: "number", percent: true, derived: (r) => markup(opt(r, "retail"), landedUnit(r)) },
  { key: "profitUnit", label: "Profit\n/Unit (PKR)", group: "Pricing", align: "right", kind: "number", money: true, derived: (r) => (opt(r, "retail") == null ? null : opt(r, "retail")! - landedUnit(r)) },
  { key: "mReseller", label: "Markup\nReseller", group: "Pricing", align: "right", kind: "number", percent: true, derived: (r) => markup(opt(r, "reseller"), landedUnit(r)) },

  { key: "sold", label: "Qty\nSold", group: "Sales", align: "right", kind: "number", total: true },
  { key: "pr", label: "Qty\nPR", group: "Sales", align: "right", kind: "number", total: true },
  { key: "remaining", label: "Remaining\nQuantity", group: "Sales", align: "right", kind: "number", total: true, derived: (r) => n(r, "qty") - n(r, "sold") - n(r, "pr") },

  { key: "itemPaidQ", label: "Item\nPaid?", group: "Payments", align: "center", kind: "text", derived: (r) => (n(r, "itemPaidAmt") > 0 || r.itemPaidOn ? "Yes" : "No") },
  { key: "shipPaidQ", label: "Ship\nPaid?", group: "Payments", align: "center", kind: "text", derived: (r) => (n(r, "shipPaidAmt") > 0 || r.shipPaidOn ? "Yes" : "No") },
  { key: "itemPaidAmt", label: "Item Paid\nAmt", group: "Payments", align: "right", kind: "number", money: true, total: true },
  { key: "shipPaidAmt", label: "Ship Paid\nAmt", group: "Payments", align: "right", kind: "number", money: true, total: true },
  { key: "totalPaid", label: "Total\nPaid", group: "Payments", align: "right", kind: "number", money: true, total: true, derived: (r) => n(r, "itemPaidAmt") + n(r, "shipPaidAmt") },
  { key: "itemPaidOn", label: "Item Paid\nDate", group: "Payments", align: "left", kind: "date" },
  { key: "shipPaidOn", label: "Ship Paid\nDate", group: "Payments", align: "left", kind: "date" },

  { key: "vendor", label: "Vendor", group: "Supply", align: "left", kind: "text" },
  { key: "status", label: "Status", group: "Supply", align: "left", kind: "text" },
];

export const ALL_COLUMN_KEYS = COLUMNS.map((c) => c.key);
// The pinned Item column is the row label — it is always present and cannot be unticked.
export const REQUIRED_COLUMN_KEYS = COLUMNS.filter((c) => c.pinned).map((c) => c.key);
export const ESSENTIAL_COLUMN_KEYS = ["name", "landedUnit", "retail", "reseller", "mRetail", "profitUnit", "remaining"];
export const COLUMN_GROUPS = [...new Set(COLUMNS.map((c) => c.group))];

// Resolve a sheet's stored key list to real columns. Always returns declaration order (so a sheet
// reads like the catalogue regardless of tick order), always includes the required columns, and
// falls back to the full set for a sheet that has no selection stored. Unknown keys — a column
// retired from the registry — are dropped rather than crashing the grid.
export function resolveColumns(keys: string[] | null | undefined): SheetCol[] {
  if (!keys || keys.length === 0) return COLUMNS;
  const want = new Set([...keys, ...REQUIRED_COLUMN_KEYS]);
  return COLUMNS.filter((c) => want.has(c.key));
}

// Value shown in a cell: derived columns compute, input columns read the stored blob.
export function cellValue(col: SheetCol, cells: SheetCells): number | string | null {
  if (col.derived) return col.derived(cells);
  const v = cells[col.key];
  return v == null || v === "" ? null : v;
}

// Column footer/subtotal. Only summable input+derived numerics carry one; a rate or a price would be
// meaningless summed, so `total` is opt-in per column rather than "every number".
export function columnTotal(col: SheetCol, rows: SheetCells[]): number | null {
  if (!col.total) return null;
  return rows.reduce((s, r) => {
    const v = cellValue(col, r);
    return s + (typeof v === "number" ? v : 0);
  }, 0);
}
