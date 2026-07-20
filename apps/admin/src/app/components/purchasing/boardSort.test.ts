// Card ordering within a pipeline lane. These comparators run over live board data, so the
// regression that matters most is robustness: a single card missing a field must not throw and
// take the whole board down with it (it did — the first cut called .localeCompare on an
// undefined created_at and blanked the Overview tab).
import { describe, expect, it } from "vitest";
import { poSorter, planSorter, SORTS } from "./PurchaseBoard";
import type { PurchaseOrderListRow, PODue } from "../../data/purchasing";
import type { PlannedPurchase } from "../../data/pipeline";

const po = (over: Partial<PurchaseOrderListRow>): PurchaseOrderListRow => ({
  id: "x", po_no: "PO-1", supplier_id: "s", status: "ordered", frozen_rate_rmb_pkr: 40,
  ordered_on: null, expected_on: null, received_on: null, created_at: "2026-01-01T00:00:00Z",
  suppliers: { name: "Zed" }, line_count: 1, category_ids: [], ...over,
});
const due = (id: string, cost: number): [string, PODue] =>
  [id, { purchase_order_id: id, po_no: null, supplier_id: "s", cost, paid: 0, due: cost, credit: 0 }];

describe("poSorter", () => {
  const a = po({ id: "a", created_at: "2026-01-01T00:00:00Z", expected_on: "2026-03-01", suppliers: { name: "Alpha" } });
  const b = po({ id: "b", created_at: "2026-02-01T00:00:00Z", expected_on: "2026-02-01", suppliers: { name: "Zeta" } });

  it("newest first by default", () => {
    expect([a, b].sort(poSorter("recent", new Map())).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("oldest first reverses it", () => {
    expect([a, b].sort(poSorter("oldest", new Map())).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("arriving soonest uses the expected date", () => {
    expect([a, b].sort(poSorter("eta", new Map())).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("a PO with no ETA sorts LAST, not first — unknown is not imminent", () => {
    const undated = po({ id: "u", expected_on: null });
    expect([undated, a, b].sort(poSorter("eta", new Map())).map((p) => p.id)).toEqual(["b", "a", "u"]);
  });

  it("highest value uses the dues map, and a PO with no dues row counts as zero", () => {
    const dues = new Map([due("a", 500), due("b", 9000)]);
    const unknown = po({ id: "u" });
    expect([a, unknown, b].sort(poSorter("value", dues)).map((p) => p.id)).toEqual(["b", "a", "u"]);
  });

  it("vendor A–Z", () => {
    expect([b, a].sort(poSorter("vendor", new Map())).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("never throws on a card missing created_at or a vendor", () => {
    const broken = { ...po({ id: "broken" }), created_at: undefined, suppliers: null } as unknown as PurchaseOrderListRow;
    for (const { key } of SORTS) {
      expect(() => [broken, a, b].sort(poSorter(key, new Map()))).not.toThrow();
    }
  });
});

describe("planSorter", () => {
  const plan = (over: Partial<PlannedPurchase>): PlannedPurchase => ({
    id: "p", item_name: "Thing", product_id: null, supplier_id: null, planned_qty: null,
    est_unit_cost_pkr: null, target_retail_pkr: null, priority: "medium", status: "researching",
    notes: null, graduated_to_po_id: null, created_at: "2026-01-01T00:00:00Z",
    products: null, suppliers: null, purchase_orders: null, ...over,
  });

  it("orders by estimated line value when sorting by value", () => {
    const cheap = plan({ id: "cheap", planned_qty: 1, est_unit_cost_pkr: 100 });
    const dear = plan({ id: "dear", planned_qty: 10, est_unit_cost_pkr: 100 });
    expect([cheap, dear].sort(planSorter("value")).map((p) => p.id)).toEqual(["dear", "cheap"]);
  });

  it("leaves wishlist order untouched under Arriving soonest — a plan has no ETA", () => {
    const x = plan({ id: "x" }), y = plan({ id: "y" });
    expect([x, y].sort(planSorter("eta")).map((p) => p.id)).toEqual(["x", "y"]);
  });

  it("never throws on a plan missing created_at", () => {
    const broken = { ...plan({ id: "b" }), created_at: undefined } as unknown as PlannedPurchase;
    for (const { key } of SORTS) {
      expect(() => [broken, plan({ id: "ok" })].sort(planSorter(key))).not.toThrow();
    }
  });
});
