// Locks the client's per-line discount rounding to what create_invoice/update_invoice store
// (migration 20260622090112: round(qty * price_pkr * discount_pct, 2), per line).
//
// If these ever disagree, the operator is shown a total the server then refuses to match —
// the invoice silently issues for a different amount than the one on screen.
import { describe, expect, it } from "vitest";
import { lineDiscountPkr, pctFromPrice, priceFromPct } from "./invoices";

describe("back-solving a discount from an edited price", () => {
  it("derives the percentage the operator implied by typing a lower price", () => {
    // The worked example: list 1900, agreed 1700 → 200 off → 10.5263…%
    expect(pctFromPrice(1900, 1700)).toBeCloseTo(10.526315789, 6);
  });

  it("round-trips back to the typed price — the whole point of numeric(9,8)", () => {
    const pct = pctFromPrice(1900, 1700);
    expect(priceFromPct(1900, pct)).toBe(1700);
    // And the rupee discount the server will recompute lands on the same figure.
    expect(lineDiscountPkr(1900, 1, pct)).toBe(200);
  });

  it("round-trips for awkward prices too", () => {
    for (const [list, agreed] of [[19590, 17631], [333.33, 299.99], [7, 1], [100000, 99999]]) {
      expect(priceFromPct(list, pctFromPrice(list, agreed))).toBe(agreed);
    }
  });

  it("treats a price at or above list as no discount, not a negative one", () => {
    expect(pctFromPrice(1900, 1900)).toBe(0);
    expect(pctFromPrice(1900, 2500)).toBe(0);
  });

  it("does not divide by a zero list price", () => {
    expect(pctFromPrice(0, 0)).toBe(0);
    expect(Number.isFinite(pctFromPrice(0, 500))).toBe(true);
  });

  it("gives a free line at 100%", () => {
    expect(pctFromPrice(1900, 0)).toBe(100);
    expect(priceFromPct(1900, 100)).toBe(0);
  });
});

describe("lineDiscountPkr", () => {
  it("matches the worked example the discount UI is built around", () => {
    // 1 × 80,000 at 10% off → 8,000 off, line nets 72,000.
    expect(lineDiscountPkr(80_000, 1, 10)).toBe(8_000);
  });

  it("applies the percentage to the whole line, not the unit price", () => {
    expect(lineDiscountPkr(20_000, 4, 25)).toBe(20_000);
  });

  it("is zero when no discount is entered", () => {
    expect(lineDiscountPkr(19_595, 3, 0)).toBe(0);
  });

  it("takes the entire line at 100%", () => {
    expect(lineDiscountPkr(12_345.67, 2, 100)).toBe(24_691.34);
  });

  it("rounds to 2dp, as the numeric(12,2) column does", () => {
    // 333.33 × 1 × 33% = 109.9989 → 110.00, not 109.9989.
    expect(lineDiscountPkr(333.33, 1, 33)).toBe(110);
  });

  it("rounds each line independently, so summing lines cannot drift from the server", () => {
    // Three lines that each round up; the server rounds per line and sums, so must we.
    const lines = [
      { price: 0.005, qty: 1, pct: 100 },
      { price: 0.005, qty: 1, pct: 100 },
      { price: 0.005, qty: 1, pct: 100 },
    ];
    const summed = lines.reduce((s, l) => s + lineDiscountPkr(l.price, l.qty, l.pct), 0);
    expect(summed).toBe(0.03);
  });
});
