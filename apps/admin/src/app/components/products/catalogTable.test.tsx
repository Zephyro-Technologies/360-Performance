// The Essentials preset is a client-specified column set (Hamid's list), so it is locked here:
// exactly Item + the six figures he asked for, in his order. Also guards the money formatter
// against re-introducing a doubled "Rs Rs" prefix.
import { afterEach, test, expect } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { InHouseCatalogTable } from "./InHouseCatalogTable";
import type { PurchaseLineDetail, Category } from "../../data/catalog";

afterEach(cleanup);

const CATEGORIES = [
  { id: "c1", name: "Exhaust & Induction", slug: "exhaust-induction", parent_id: null },
] as unknown as Category[];

// Civic X Downpipe, straight from the client's costing sheet.
const LINE = {
  line_id: "l1",
  product_id: "p1",
  product_name: "Civic X Downpipe",
  sku: "DOW-001",
  category_id: "c1",
  qty_ordered: 10,
  unit_cost_pkr: 36050,
  shipping_per_unit_pkr: 3400,
  packaging_per_unit_pkr: 0,
  landed_cost_per_unit_pkr: 39450,
  landed_total_pkr: 394500,
  retail_pkr: 66500,
  reseller_pkr: 58500,
  qty_sold: 0,
  qty_pr: 0,
  item_paid_amount_pkr: 360500,
  ship_paid_amount_pkr: 34000,
  item_paid_on: null,
  ship_paid_on: null,
  vendor_name: "Nanton Nanshen/Luke",
  po_status: "in_transit",
} as unknown as PurchaseLineDetail;

function renderEssentials() {
  render(
    <MemoryRouter>
      <InHouseCatalogTable lines={[LINE]} categories={CATEGORIES} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Essentials" }));
}

test("Essentials shows exactly the client's six columns, in order", () => {
  renderEssentials();
  const headers = screen
    .getAllByRole("columnheader")
    .map((th) => th.textContent?.replace(/\s+/g, " ").trim())
    // drop the section super-header row (its cells are empty or a group name)
    .filter((t) => t && t !== "Cost" && t !== "Pricing" && t !== "Sales");

  expect(headers).toEqual([
    "Item",
    "Per Unit Cost",
    "Retail Price",
    "Reseller Price",
    "Profit Margin",
    "Profit /Unit (PKR)",
    "Remaining Quantity",
  ]);
});

test("Essentials hides the Full-view columns (qty, shipping, payments, vendor, status)", () => {
  renderEssentials();
  const headers = screen.getAllByRole("columnheader").map((th) => th.textContent ?? "");
  for (const gone of ["Unit Cost", "Shipping", "Total Paid", "Vendor", "Status", "Qty Sold"]) {
    expect(headers.some((h) => h.includes(gone))).toBe(false);
  }
});

test("profit and markup are computed off landed cost, and money renders a single Rs", () => {
  renderEssentials();
  const row = screen.getByText("Civic X Downpipe").closest("tr")!;
  const cells = within(row).getAllByRole("cell").map((td) => td.textContent ?? "");

  // 66,500 - 39,450 = 27,050 profit/unit; markup = 27,050 / 39,450 = 68.6% (NOT the 40.7% margin)
  expect(cells.some((c) => c.includes("68.6%"))).toBe(true);
  expect(cells.some((c) => c.includes("27K"))).toBe(true);

  // "Rs 39K", never "Rs Rs 39K"
  const money = cells.filter((c) => c.includes("Rs"));
  expect(money.length).toBeGreaterThan(0);
  for (const m of money) expect(m).not.toContain("Rs Rs");
});
