import { test, expect } from "vitest";
import { lineLanded, lineDues, type POLine } from "./purchasing";

const line = (over: Partial<POLine>): POLine => ({
  id: "l", product_id: "p", qty_ordered: 10, qty_received: 0,
  unit_cost_rmb: 900, shipping_per_unit_pkr: 340, packaging_per_unit_pkr: 0,
  item_paid_amount_pkr: null, item_paid_on: null, item_credit_added_pkr: 0, item_paid_from_credit: false, ship_paid_amount_pkr: null, ship_paid_on: null, ship_paid_from_credit: false,
  freight_vendor_id: null,
  products: null, ...over,
});

test("lineLanded: item (RMB × frozen rate) + shipping + packaging per unit, × qty for total", () => {
  const r = lineLanded(line({ qty_ordered: 10, unit_cost_rmb: 900, shipping_per_unit_pkr: 340, packaging_per_unit_pkr: 0 }), 40);
  expect(r.unitPkr).toBe(36000); // 900 RMB × 40
  expect(r.landedPerUnit).toBe(36340); // + 340 shipping
  expect(r.landedTotal).toBe(363400); // × 10
});

test("lineLanded: packaging is included in the landed cost", () => {
  const r = lineLanded(line({ qty_ordered: 2, unit_cost_rmb: 100, shipping_per_unit_pkr: 50, packaging_per_unit_pkr: 25 }), 40);
  expect(r.landedPerUnit).toBe(4075); // 100×40 + 50 + 25
  expect(r.landedTotal).toBe(8150);
});

test("lineLanded: no frozen rate yet → item cost is 0 (only ship + packaging show until the rate is set)", () => {
  const r = lineLanded(line({ qty_ordered: 5, unit_cost_rmb: 1000, shipping_per_unit_pkr: 300, packaging_per_unit_pkr: 50 }), null);
  expect(r.unitPkr).toBe(0);
  expect(r.landedPerUnit).toBe(350);
});

test("lineDues: item + shipping cost/paid/due, banked credit — the payables view (packaging excluded)", () => {
  // qty 10, 5 RMB × rate 40 = 2000 item; 3 PKR ship/unit = 30 ship. Paid 1000 on items, 0 on ship.
  const d = lineDues(line({ qty_ordered: 10, unit_cost_rmb: 5, shipping_per_unit_pkr: 3, packaging_per_unit_pkr: 99, item_paid_amount_pkr: 1000, item_credit_added_pkr: 50 }), 40);
  expect(d.itemCost).toBe(2000);
  expect(d.shipCost).toBe(30);
  expect(d.itemDue).toBe(1000); // 2000 - 1000
  expect(d.shipDue).toBe(30); // 30 - 0
  expect(d.cost).toBe(2030);
  expect(d.paid).toBe(1000);
  expect(d.due).toBe(1030);
  expect(d.credit).toBe(50); // banked over-payment credit, tracked separately
});

test("lineDues: no rate → item cost 0, only shipping is owed", () => {
  const d = lineDues(line({ qty_ordered: 4, unit_cost_rmb: 100, shipping_per_unit_pkr: 25 }), null);
  expect(d.itemCost).toBe(0);
  expect(d.shipCost).toBe(100);
  expect(d.due).toBe(100);
});
