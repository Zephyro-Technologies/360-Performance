// Column model for a query sheet — the same 28 headers, order and section grouping as the In-House
// catalogue table (components/products/InHouseCatalogTable.tsx), so the rough sheet reads exactly
// like the catalogue the operator already knows.
//
// The split that matters: INPUT columns are typed by hand and stored in the row's `cells` jsonb;
// DERIVED columns are computed here and never stored. The formulas below are deliberately the same
// arithmetic as the catalogue's (landed = unit + shipping + packaging; markup is profit over COST,
// not over price), so a sheet and the catalogue can't quietly disagree.

export type CellKind = "text" | "number" | "date" | "bool";

export interface SheetCol {
  key: string;
  label: string; // may contain "\n" for a two-line header, as in the catalogue
  group: string;
  align: "left" | "right" | "center";
  kind: CellKind;
  // Where the value LIVES in the row blob. Defaults to `key`. Two columns may share one cellKey
  // to show the same figure in two places (Quantity appears in both the request and the purchase
  // block) — editing either edits the one underlying value, so they can never disagree.
  cellKey?: string;
  derived?: (r: SheetCells) => number | string | null; // set ⇒ read-only, computed
  pinned?: boolean;
  money?: boolean;
  percent?: boolean;
  total?: boolean; // summed in the footer / subtotal rows
  custom?: boolean; // operator-defined column, stored per sheet rather than in this registry
}

// Where a column reads/writes in the row blob.
export const cellKeyOf = (c: SheetCol) => c.cellKey ?? c.key;

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

// Sale-side profit for a line: what we'd charge, less what the line actually costs us, × qty.
// Blank until a sale price is entered — a 0 here would read as "no profit" rather than "unpriced".
export const lineProfit = (r: SheetCells) => {
  const sale = opt(r, "salePrice");
  return sale == null ? null : (sale - landedUnit(r)) * n(r, "qty");
};

export const COLUMNS: SheetCol[] = [
  { key: "name", label: "Item", group: "Item", align: "left", kind: "text", pinned: true },
  { key: "partNo", label: "Part #", group: "Item", align: "left", kind: "text" },
  { key: "brand", label: "Brand", group: "Item", align: "left", kind: "text" },

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

  // The purchase-side mirror of Qty: the SAME value as the "Qty" column above (shared cellKey), so
  // the sheet reads correctly scanning across the vendor block without a second number to keep in
  // step. No `total` — the footer must not sum one quantity twice.
  { key: "qty2", cellKey: "qty", label: "Quantity", group: "Cost", align: "right", kind: "number" },
  { key: "weight", label: "Weight\n(kg)", group: "Cost", align: "right", kind: "number", total: true },
  // "Cost Internal" (per unit) and "Internal Cost" (line total) are the operator's names for the
  // landed cost build-up. They deliberately reuse landedUnit — the SAME arithmetic as "Per Unit
  // Cost"/"Landed Total" and as the catalogue — so a sheet can never show two costs that disagree.
  { key: "costInternal", label: "Cost Internal\n(per unit)", group: "Cost", align: "right", kind: "number", money: true, derived: landedUnit },
  { key: "internalCost", label: "Internal Cost\n(total)", group: "Cost", align: "right", kind: "number", money: true, total: true, derived: (r) => landedUnit(r) * n(r, "qty") },

  { key: "retail", label: "Retail\nPrice", group: "Pricing", align: "right", kind: "number", money: true },
  { key: "salePrice", label: "Sale\nPrice", group: "Pricing", align: "right", kind: "number", money: true },
  { key: "profit", label: "Profit", group: "Pricing", align: "right", kind: "number", money: true, total: true, derived: lineProfit },
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

  { key: "purchasingDone", label: "Purchasing\nDone?", group: "Progress", align: "center", kind: "bool" },
  { key: "delivered", label: "Delivered?", group: "Progress", align: "center", kind: "bool" },
];

export const ALL_COLUMN_KEYS = COLUMNS.map((c) => c.key);
// The pinned Item column is the row label — it is always present and cannot be unticked.
export const REQUIRED_COLUMN_KEYS = COLUMNS.filter((c) => c.pinned).map((c) => c.key);
export const ESSENTIAL_COLUMN_KEYS = ["name", "landedUnit", "retail", "reseller", "mRetail", "profitUnit", "remaining"];
// The client's requested query layout, in their order. rmbRate is included because without it the
// RMB→PKR conversion is ×0 and every cost column would read zero.
export const QUERY_COLUMN_KEYS = [
  "name", "partNo", "brand", "qty", "salePrice", "vendor",
  "unitCostRmb", "rmbRate", "qty2", "costInternal", "weight", "shipUnit",
  "internalCost", "purchasingDone", "delivered", "profit",
];
export const COLUMN_GROUPS = [...new Set(COLUMNS.map((c) => c.group))];

// ---- custom (operator-defined) columns ---------------------------------------------------------
// Stored per sheet, not in this registry. Keys are namespaced so a custom column can never collide
// with a built-in one (now or after a future registry addition).
export const CUSTOM_PREFIX = "c:";
export const isCustomKey = (k: string) => k.startsWith(CUSTOM_PREFIX);

export interface CustomColumnDef {
  key: string;   // always CUSTOM_PREFIX-prefixed
  label: string;
  kind: CellKind;
}

// jsonb round-trips as `unknown`; a hand-edited row could be anything, so validate defensively.
const KINDS: CellKind[] = ["text", "number", "date", "bool"];
export function toCustomColumns(v: unknown): CustomColumnDef[] {
  if (!Array.isArray(v)) return [];
  const out: CustomColumnDef[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!isCustomKey(key) || !label) continue;
    const kind = KINDS.includes(r.kind as CellKind) ? (r.kind as CellKind) : "text";
    if (out.some((c) => c.key === key)) continue; // first wins; a dupe key would render twice
    out.push({ key, label, kind });
  }
  return out;
}

export function customToCol(def: CustomColumnDef): SheetCol {
  return {
    key: def.key,
    label: def.label,
    group: "Custom",
    align: def.kind === "number" ? "right" : def.kind === "bool" ? "center" : "left",
    kind: def.kind,
    custom: true,
    total: def.kind === "number",
  };
}

// Resolve a sheet's stored key list to real columns, IN THE STORED ORDER — the operator can drag
// columns around, so the saved order is the layout. (Before column reordering existed this forced
// declaration order so a sheet read like the catalogue; honouring the order is what makes drag work.)
// Always includes the required columns, falls back to the full set when nothing is stored, and drops
// unknown keys — a retired column — rather than crashing the grid.
export function resolveColumns(keys: string[] | null | undefined, custom: CustomColumnDef[] = []): SheetCol[] {
  const byKey = new Map<string, SheetCol>(COLUMNS.map((c) => [c.key, c]));
  for (const d of custom) byKey.set(d.key, customToCol(d));
  if (!keys || keys.length === 0) return [...COLUMNS, ...custom.map(customToCol)];

  const out: SheetCol[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const col = byKey.get(k);
    if (col && !seen.has(k)) {
      seen.add(k);
      out.push(col);
    }
  }
  // A required column the stored order forgot goes first, so the row always has its label.
  for (const k of REQUIRED_COLUMN_KEYS) {
    if (!seen.has(k)) {
      const col = byKey.get(k);
      if (col) out.unshift(col);
    }
  }
  return out;
}

// Value shown in a cell: derived columns compute, input columns read the stored blob.
export function cellValue(col: SheetCol, cells: SheetCells): number | string | null {
  if (col.derived) return col.derived(cells);
  const v = cells[cellKeyOf(col)];
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
