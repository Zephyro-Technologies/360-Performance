// The query sheet's derived columns must use the SAME arithmetic as the In-House catalogue table
// (landed = unit + shipping + packaging; markup is profit over COST, not over price). If these
// drift, a rough sheet would quietly disagree with the catalogue it's modelled on.
import { describe, it, expect } from "vitest";
import {
  COLUMNS, cellValue, columnTotal, landedUnit, unitCost, resolveColumns,
  ALL_COLUMN_KEYS, ESSENTIAL_COLUMN_KEYS, REQUIRED_COLUMN_KEYS,
  type SheetCells,
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

  it("renders selected columns in catalogue order, not tick order", () => {
    expect(resolveColumns(["status", "retail", "qty"]).map((c) => c.key)).toEqual(["name", "qty", "retail", "status"]);
  });

  it("falls back to every column when a sheet has no selection stored", () => {
    expect(resolveColumns([])).toHaveLength(28);
    expect(resolveColumns(null)).toHaveLength(28);
  });

  it("offers presets that are all real columns", () => {
    expect(ALL_COLUMN_KEYS).toHaveLength(28);
    for (const k of [...ESSENTIAL_COLUMN_KEYS, ...REQUIRED_COLUMN_KEYS]) {
      expect(ALL_COLUMN_KEYS, `${k} must be a real column`).toContain(k);
    }
    expect(REQUIRED_COLUMN_KEYS).toEqual(["name"]);
  });

  it("mirrors the catalogue's 28 headers and section order", () => {
    expect(COLUMNS).toHaveLength(28);
    expect([...new Set(COLUMNS.map((c) => c.group))]).toEqual(["Item", "Cost", "Pricing", "Sales", "Payments", "Supply"]);
    // Derived cells must never be editable inputs.
    expect(COLUMNS.filter((c) => c.derived).map((c) => c.key)).toEqual([
      "unitCost", "totalCost", "shipTotal", "landedUnit", "landedTotal",
      "mRetail", "profitUnit", "mReseller", "remaining", "itemPaidQ", "shipPaidQ", "totalPaid",
    ]);
  });
});
