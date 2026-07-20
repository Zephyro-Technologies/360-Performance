import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Every command-center figure must be summed straight from its verified hook/view (card = detail),
// never recomputed. This proves the aggregation reads the hooks and totals them faithfully.
//
// The reporting period is NOT mocked: it comes from the URL via usePeriodParams, so the real hook
// runs against MemoryRouter and resolves the default (last complete month). Only its Supabase-backed
// input (useActivityDays) is stubbed. The spread must survive — Analytics still imports the real
// monthWindows/iso from this module.
vi.mock("../data/analytics", async (orig) => ({
  ...((await orig()) as object),
  useActivityDays: () => ({ data: [], isLoading: false }),
  useAnalyticsDaily: () => ({ data: [] }),
  useInvoiceBalances: () => ({ data: [{ invoice_id: "i1", total_pkr: 5000, paid_pkr: 0, balance_pkr: 5000, status: "unpaid" }] }),
  useCategorySales: () => ({ data: [] }),
  useTopCustomer: () => ({ data: null }),
  usePnlBetween: () => ({
    data: {
      revenue_pkr: 0, cogs_pkr: 0, gross_margin_pkr: 0, house_margin_pkr: 0, investor_share_pkr: 0,
      marketing_pkr: 0, corrections_pkr: 0, refunds_pkr: 0, delivery_pkr: 0, operating_expense_pkr: 0, kept_pkr: 0,
    },
    isLoading: false,
  }),
}));
vi.mock("../data/catalog", () => ({
  useProducts: () => ({ data: [
    { id: "p1", stock_value_pkr: 31000, availability: "in_stock", visibility: "visible" },
    { id: "p2", stock_value_pkr: 22000, availability: "low_stock", visibility: "visible" },
  ] }),
}));
vi.mock("../data/purchasing", () => ({ useVendorPayables: () => ({ data: [{ supplier_id: "s1", name: "V", item_owed_pkr: 14000, ship_owed_pkr: 6000 }] }) }));
vi.mock("../data/investors", () => ({
  useInvestorOwed: () => ({ data: [{ investor_id: "iv1", owed_pkr: 41000 }] }),
  usePnlSummary: () => ({ data: { kept_pkr: 88000 } }),
}));
vi.mock("../data/vendorAdvances", () => ({ useVendorBalances: () => ({ data: [{ vendor_account_id: "va1", balance_pkr: 17000 }] }) }));
vi.mock("../data/deliveries", () => ({ useDeliveries: () => ({ data: [{ id: "d1", amount_pkr: 12000, paid_on: null }] }) }));
vi.mock("../data/orders", async (orig) => ({ ...((await orig()) as object), useOrders: () => ({ data: [] }) }));
vi.mock("../data/pipeline", async (orig) => ({ ...((await orig()) as object), usePlannedPurchases: () => ({ data: [] }) }));
vi.mock("../components/data/VendorAdvancesPanel", () => ({ VendorAdvancesPanel: () => null }));

import { Analytics } from "./Analytics";

afterEach(cleanup);

test("command center totals each figure straight from its view (stock value / A/P / investor owed / advances)", () => {
  render(<MemoryRouter><Analytics /></MemoryRouter>);
  expect(screen.getByText(/Rs 53,000/)).toBeTruthy(); // stock value = 31000 + 22000 (Σ product_cost.stock_value_pkr)
  expect(screen.getByText(/Rs 20,000/)).toBeTruthy(); // vendor payables = item 14000 + ship 6000
  expect(screen.getByText(/Rs 41,000/)).toBeTruthy(); // investor owed
  expect(screen.getByText(/Rs 17,000/)).toBeTruthy(); // vendor advances parked
  expect(screen.getByText(/Rs 12,000/)).toBeTruthy(); // owed to couriers = unpaid customer delivery
});

test("every full-breakdown tile drills down somewhere", () => {
  render(<MemoryRouter><Analytics /></MemoryRouter>);
  const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
  for (const target of ["/insights/revenue", "/insights/product-costs", "/insights/operating-expenses", "/insights/profit"]) {
    expect(hrefs).toContain(target);
  }
  // Investors' share has no /insights waterfall; the Investors page is its real breakdown.
  expect(hrefs).toContain("/investors");
});

test("an activity tile is clickable as a whole card, not just its arrow", () => {
  render(<MemoryRouter><Analytics /></MemoryRouter>);
  const cardHref = (name: RegExp) => screen.getByRole("heading", { name }).closest("a")?.getAttribute("href");
  // The heading sitting inside the anchor is what proves the CARD is the link, not a corner of it.
  expect(cardHref(/Recent orders/i)).toBe("/orders");
  expect(cardHref(/Awaiting stock/i)).toBe("/orders");
  expect(cardHref(/Procurement pipeline/i)).toBe("/purchasing");
});

test("no nested anchors anywhere on the dashboard", () => {
  // Card-wide links make this easy to break: an <a> inside an <a> is invalid HTML and punches a
  // dead hole in the parent card's hit area.
  const { container } = render(<MemoryRouter><Analytics /></MemoryRouter>);
  expect(container.querySelectorAll("a a")).toHaveLength(0);
});
