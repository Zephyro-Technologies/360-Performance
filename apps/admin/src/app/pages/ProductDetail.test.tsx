import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

const product = {
  id: "abc", sku: "DP-007", slug: "stage-2-downpipe", name: "Stage 2 Downpipe", brand: "FLOW",
  category_id: "leaf1", short_description: "Short blurb", description: "Long description here",
  compatibility: "BMW F30", price_pkr: 100000, sale_price_pkr: 90000, reseller_price_pkr: 85000,
  mpn: "MPN-1", meta_description: "Meta",
  availability: "in_stock", visibility: "visible", published: true, featured: true, status: "active", owner_kind: "house",
  images: ["a.jpg", "b.jpg"], specs: [{ label: "Material", value: "Stainless Steel" }],
  low_stock_threshold: 3, made_to_order: false,
  categories: { name: "Downpipes", parent_id: "par1" },
  // derived (from batches) — weighted-average cost is the margin basis now
  on_hand_qty: 12, batch_count: 2, weighted_avg_cost_pkr: 60000, stock_value_pkr: 720000,
};
const cats = [
  { id: "leaf1", slug: "downpipes", name: "Downpipes", parent_id: "par1", sort_order: 1 },
  { id: "par1", slug: "exhaust", name: "Exhaust & Induction", parent_id: null, sort_order: 0 },
];
const history = [
  { orderId: "o1", orderNo: "ORD-1004", createdAt: "2026-06-23T00:00:00Z", stage: "delivered", qty: 2, pricePkr: 135000 },
];
// One purchase, priced in the currency it was actually bought in: ¥400 × 40 = Rs 16,000/unit.
const purchases = [
  {
    line_id: "l1", product_id: "abc", product_name: "Stage 2 Downpipe", sku: "DP-007",
    category_id: "leaf1", owner_kind: "house", retail_pkr: 100000, reseller_pkr: 85000,
    qty_ordered: 10, qty_received: 10,
    unit_cost_pkr: 16000, shipping_per_unit_pkr: 1000, packaging_per_unit_pkr: 0,
    landed_cost_per_unit_pkr: 17000, landed_total_pkr: 170000,
    item_paid_amount_pkr: null, item_paid_on: null, ship_paid_amount_pkr: null, ship_paid_on: null,
    qty_sold: 0, qty_pr: 0, vendor_name: "Nanton Nanshen", po_status: "in_transit",
    unit_cost_rmb: 400, frozen_rate_rmb_pkr: 40, po_created_at: "2026-06-01T00:00:00Z",
  },
];

// `mock`-prefixed so vitest's vi.mock hoisting allows the reference; lets tests vary it.
let mockHistory: { isLoading: boolean; isError: boolean; data: typeof history } = {
  isLoading: false, isError: false, data: history,
};

vi.mock("../components/products/ProductDialog", () => ({ ProductDialog: () => null }));
vi.mock("../data/auth", () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock("../data/storage", () => ({ imageUrl: (_b: string, p: string) => p }));
vi.mock("../data/settings", () => ({ useLowStockDefault: () => ({ data: 3 }) }));
vi.mock("../data/catalog", () => ({
  useProduct: () => ({ isLoading: false, isError: false, data: product }),
  useProductOrderHistory: () => mockHistory,
  useProductPurchases: () => ({ isLoading: false, isError: false, data: purchases }),
  useCategories: () => ({ data: cats }),
  useDeleteProduct: () => ({ mutateAsync: vi.fn() }),
}));

import { ProductDetail } from "./ProductDetail";

afterEach(cleanup);

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/products/abc"]}>
      <Routes>
        <Route path="/products/:id" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

test("shows the internal business picture: category path, margin (vs derived cost), ownership, history", () => {
  renderDetail();

  expect(screen.getByRole("heading", { name: "Stage 2 Downpipe" })).toBeTruthy();
  // Parent › Leaf resolved from the categories list
  expect(screen.getByText((c) => /Exhaust & Induction › Downpipes/.test(c))).toBeTruthy();
  // Margin (at list price) = price(100000) − weighted-avg cost(60000) = 40000 → 40.0%
  expect(screen.getByText(/40\.0%/)).toBeTruthy();
  // On sale (90k < 100k): Margin (at sale) = 90000 − 60000 = 30000 → 33.3% (distinct from list)
  expect(screen.getByText(/33\.3%/)).toBeTruthy();
  // internal-only fields the storefront hides: ownership + derived stock
  expect(screen.getByText("House (360)")).toBeTruthy();
  // order history (the high-value part)
  expect(screen.getByText("ORD-1004")).toBeTruthy();
  expect(screen.getByText("delivered")).toBeTruthy();
  // primary image indicated
  expect(screen.getByText("Primary")).toBeTruthy();
  // Edit/Delete act here
  expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
});

test("empty order history shows the empty state, not a broken table", () => {
  mockHistory = { isLoading: false, isError: false, data: [] };
  renderDetail();
  expect(screen.getByText(/hasn't appeared on any orders/i)).toBeTruthy();
  expect(screen.queryByText("ORD-1004")).toBeNull();
  mockHistory = { isLoading: false, isError: false, data: history }; // restore
});

// The client asks "what did we buy this at?" in RMB — the purchase currency — not just the
// converted PKR. The rate frozen on that PO must sit beside it so the maths is readable back.
test("acquisition cost shows the RMB the goods were bought at, the frozen rate, and the PKR it converted to", () => {
  renderDetail();
  expect(screen.getByText("¥400")).toBeTruthy(); // bought at 400 RMB
  expect(screen.getByText("Rs 16,000")).toBeTruthy(); // ¥400 × 40 = Rs 16,000 per unit
  expect(screen.getByText("Nanton Nanshen")).toBeTruthy(); // which vendor it came from
});
