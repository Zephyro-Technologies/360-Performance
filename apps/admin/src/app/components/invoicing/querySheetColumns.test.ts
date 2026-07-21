// The query sheet's derived columns must use the SAME arithmetic as the In-House catalogue table
// (landed = unit + shipping + packaging; markup is profit over COST, not over price). If these
// drift, a rough sheet would quietly disagree with the catalogue it's modelled on.
import { describe, it, expect } from "vitest";
import {
  COLUMNS, cellValue, cellKeyOf, columnTotal, landedUnit, unitCost, resolveColumns, toCustomColumns,
  ALL_COLUMN_KEYS, ESSENTIAL_COLUMN_KEYS, QUERY_COLUMN_KEYS, REQUIRED_COLUMN_KEYS,
  type CustomColumnDef, type SheetCells,
} from "./querySheetColumns";

const col = (key: string) => COLUMNS.find((c) => c.key === key)!;

// 900 RMB at 40 PKR/¥ = 36,000 unit cost; +340 shipping +160 packaging = 36,500 landed/unit.
const row: SheetCells = {
  name: "Turbo kit", qty: 3,
  unitCostRmb: 900, rmbRate: 40, shipUnit: 340, pkg: 160,
  retail: 50000, reseller: 43800,
  sold: 1, pr: 1,
  itemPaidAmt: 100000, shipPaidAmt: 1020,
};

describe("query sheet derived columns", () => {
  it("builds the landed cost the same way the catalogue does", () => {
    expect(unitCost(row)).toBe(36000);
    expect(landedUnit(row)).toBe(36500);
    expect(cellValue(col("totalCost"), row)).toBe(108000); // qty × unit cost
    expect(cellValue(col("shipTotal"), row)).toBe(1020);
    expect(cellValue(col("landedTotal"), row)).toBe(109500); // qty × landed/unit
  });

  it("computes markup over COST, not over price", () => {
    // (50000 - 36500) / 36500 = 36.99%, NOT (50000-36500)/50000 = 27%
    expect(cellValue(col("mRetail"), row) as number).toBeCloseTo(36.986, 2);
    expect(cellValue(col("profitUnit"), row)).toBe(13500);
    expect(cellValue(col("mReseller"), row) as number).toBeCloseTo(20.0, 2);
  });

  it("nets remaining stock and rolls up payments", () => {
    expect(cellValue(col("remaining"), row)).toBe(1); // 3 ordered - 1 sold - 1 PR
    expect(cellValue(col("totalPaid"), row)).toBe(101020);
    expect(cellValue(col("itemPaidQ"), row)).toBe("Yes");
    expect(cellValue(col("shipPaidQ"), row)).toBe("Yes");
  });

  it("treats an unpriced cell as blank, not as zero", () => {
    const bare: SheetCells = { qty: 1, unitCostRmb: 100, rmbRate: 40 };
    expect(cellValue(col("retail"), bare)).toBeNull();
    expect(cellValue(col("mRetail"), bare)).toBeNull(); // no price ⇒ no margin, not -100%
    expect(cellValue(col("profitUnit"), bare)).toBeNull();
    expect(cellValue(col("itemPaidQ"), bare)).toBe("No");
  });

  it("only sums columns that are meaningful summed", () => {
    const rows = [row, row];
    expect(columnTotal(col("landedTotal"), rows)).toBe(219000);
    expect(columnTotal(col("qty"), rows)).toBe(6);
    // A per-unit price or an FX rate summed would be nonsense — those carry no total.
    expect(columnTotal(col("rmbRate"), rows)).toBeNull();
    expect(columnTotal(col("retail"), rows)).toBeNull();
    expect(columnTotal(col("mRetail"), rows)).toBeNull();
  });

  it("hides a column without losing what was typed in it", () => {
    // The sheet only shows Item + Retail, but the cost cells are still stored and still feed the
    // derived maths — re-ticking "Per Unit Cost" must bring the real number back, not a blank.
    const cols = resolveColumns(["name", "retail"]);
    expect(cols.map((c) => c.key)).toEqual(["name", "retail"]);
    expect(landedUnit(row)).toBe(36500);
    expect(cellValue(COLUMNS.find((c) => c.key === "landedUnit")!, row)).toBe(36500);
  });

  it("always keeps the Item column and ignores keys that no longer exist", () => {
    expect(resolveColumns(["retail"]).map((c) => c.key)).toEqual(["name", "retail"]);
    expect(resolveColumns(["name", "retiredColumn"]).map((c) => c.key)).toEqual(["name"]);
  });

  // Columns are now DRAGGABLE, so the stored array is the layout. This deliberately replaces the
  // old "always render in catalogue declaration order" rule — re-sorting would have silently
  // undone any layout the operator arranged by hand.
  it("renders selected columns in the SAVED order, so a dragged layout sticks", () => {
    expect(resolveColumns(["status", "retail", "qty"]).map((c) => c.key)).toEqual(["name", "status", "retail", "qty"]);
    expect(resolveColumns(["name", "qty", "retail"]).map((c) => c.key)).toEqual(["name", "qty", "retail"]);
  });

  it("falls back to every column when a sheet has no selection stored", () => {
    expect(resolveColumns([])).toHaveLength(38);
    expect(resolveColumns(null)).toHaveLength(38);
  });

  it("offers presets that are all real columns", () => {
    expect(ALL_COLUMN_KEYS).toHaveLength(38);
    for (const k of [...ESSENTIAL_COLUMN_KEYS, ...QUERY_COLUMN_KEYS, ...REQUIRED_COLUMN_KEYS]) {
      expect(ALL_COLUMN_KEYS, `${k} must be a real column`).toContain(k);
    }
    expect(REQUIRED_COLUMN_KEYS).toEqual(["name"]);
  });

  it("mirrors the catalogue's headers and section order", () => {
    expect(COLUMNS).toHaveLength(38);
    expect([...new Set(COLUMNS.map((c) => c.group))]).toEqual(["Item", "Cost", "Pricing", "Sales", "Payments", "Supply", "Progress"]);
    // Derived cells must never be editable inputs.
    expect(COLUMNS.filter((c) => c.derived).map((c) => c.key)).toEqual([
      "unitCost", "totalCost", "shipTotal", "landedUnit", "landedTotal", "costInternal", "internalCost",
      "profit", "mRetail", "profitUnit", "mReseller", "remaining", "itemPaidQ", "shipPaidQ", "totalPaid",
    ]);
  });

  // ---- the client's requested query fields ------------------------------------------------------

  it("Quantity appears twice but is ONE value — the two columns share a cell key", () => {
    const a = col("qty");
    const b = col("qty2");
    expect(cellKeyOf(a)).toBe("qty");
    expect(cellKeyOf(b)).toBe("qty"); // the mirror reads/writes the same cell
    expect(cellValue(b, row)).toBe(3);
    // ...and only ONE of them carries a footer total, or the sheet would sum the qty twice.
    expect(columnTotal(a, [row, row])).toBe(6);
    expect(columnTotal(b, [row, row])).toBeNull();
  });

  it("Cost Internal / Internal Cost reuse the landed-cost arithmetic, so they can't disagree", () => {
    expect(cellValue(col("costInternal"), row)).toBe(landedUnit(row));      // 36,500 per unit
    expect(cellValue(col("costInternal"), row)).toBe(cellValue(col("landedUnit"), row));
    expect(cellValue(col("internalCost"), row)).toBe(109500);               // × qty 3
    expect(cellValue(col("internalCost"), row)).toBe(cellValue(col("landedTotal"), row));
  });

  it("Profit is the line total: (sale price - landed cost) x qty, blank until priced", () => {
    expect(cellValue(col("profit"), { ...row, salePrice: 50000 })).toBe(40500); // (50000-36500)×3
    expect(cellValue(col("profit"), row)).toBeNull(); // no sale price ⇒ blank, not a fake 0
    expect(columnTotal(col("profit"), [{ ...row, salePrice: 50000 }, { ...row, salePrice: 50000 }])).toBe(81000);
  });

  it("Purchasing Done? / Delivered? are yes-no cells, not typed text", () => {
    expect(col("purchasingDone").kind).toBe("bool");
    expect(col("delivered").kind).toBe("bool");
    expect(col("purchasingDone").derived).toBeUndefined(); // operator-set, not computed
  });

  // ---- custom (operator-defined) columns --------------------------------------------------------

  it("merges a sheet's own columns in, at the position the layout puts them", () => {
    const mine: CustomColumnDef[] = [{ key: "c:1", label: "Lead time", kind: "text" }];
    const cols = resolveColumns(["name", "c:1", "retail"], mine);
    expect(cols.map((c) => c.key)).toEqual(["name", "c:1", "retail"]);
    expect(cols[1].label).toBe("Lead time");
    expect(cols[1].custom).toBe(true);
  });

  it("drops a custom column that was deleted, rather than crashing the grid", () => {
    expect(resolveColumns(["name", "c:gone"], []).map((c) => c.key)).toEqual(["name"]);
  });

  it("rejects malformed stored custom columns instead of rendering junk headers", () => {
    expect(toCustomColumns(null)).toEqual([]);
    expect(toCustomColumns([{ key: "noPrefix", label: "X", kind: "text" }])).toEqual([]); // must be namespaced
    expect(toCustomColumns([{ key: "c:1", label: "   ", kind: "text" }])).toEqual([]);    // blank label
    expect(toCustomColumns([{ key: "c:1", label: "A", kind: "bogus" }])).toEqual([{ key: "c:1", label: "A", kind: "text" }]);
    // A duplicate key would render two identical columns writing the same cell — first wins.
    expect(toCustomColumns([{ key: "c:1", label: "A", kind: "text" }, { key: "c:1", label: "B", kind: "text" }]))
      .toEqual([{ key: "c:1", label: "A", kind: "text" }]);
  });
});
