import { test, expect } from "vitest";
import { boardLaneOf, paymentStatusOf, etaLabel, daysUntil, BOARD_LANES } from "./poState";

test("boardLaneOf: one lane per status so the board mirrors the PO status dropdown; received is the derived Arrived lane, cancelled is off-board", () => {
  expect(boardLaneOf("planning")).toBe("planning");
  expect(boardLaneOf("approved")).toBe("approved");
  expect(boardLaneOf("ordered")).toBe("ordered");
  expect(boardLaneOf("in_production")).toBe("production");
  expect(boardLaneOf("in_transit")).toBe("transit");
  expect(boardLaneOf("received")).toBe("arrived");
  expect(boardLaneOf("cancelled")).toBeNull();
});

test("board lanes are exactly the PO statuses, in dropdown order, with no wishlist lane", () => {
  const keys = BOARD_LANES.map((l) => l.key);
  expect(keys).toEqual(["planning", "approved", "ordered", "production", "transit", "arrived"]);
  // Wishlist items are rendered inside Planning, never as a lane of their own.
  expect(keys).not.toContain("wishlist");
});

test("paymentStatusOf: unpaid before any payment, partial once money is out, paid when nothing is due", () => {
  expect(paymentStatusOf({ cost: 100, paid: 0, due: 100 })).toBe("unpaid");
  expect(paymentStatusOf({ cost: 100, paid: 40, due: 60 })).toBe("partial");
  expect(paymentStatusOf({ cost: 100, paid: 100, due: 0 })).toBe("paid");
});

test("daysUntil / etaLabel: null for no date, overdue in the past, counts down in the future", () => {
  expect(daysUntil(null)).toBeNull();
  expect(etaLabel(null)).toBeNull();

  const past = etaLabel("2000-01-01");
  expect(past?.overdue).toBe(true);
  expect(past?.text).toMatch(/overdue/);

  const future = etaLabel("2999-01-01");
  expect(future?.overdue).toBe(false);
  expect(future?.text).toMatch(/left/);
});
