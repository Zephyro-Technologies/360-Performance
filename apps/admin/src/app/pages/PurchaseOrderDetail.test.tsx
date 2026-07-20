import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Regression guard for the "select renders but won't open" failure class: the PO-line
// product picker is the Radix Select primitive (same as the working dropdowns), so it MUST
// open + select when the catalogue has products — and show a hint, not a dead select, when empty.
const mockAdd = vi.fn().mockResolvedValue(undefined);
const mockUpdatePrice = vi.fn().mockResolvedValue(undefined);
type MockProduct = { id: string; name: string; sku: string; price_pkr?: number; reseller_price_pkr?: number; weighted_avg_cost_pkr?: number };
const DEFAULT_PRODUCTS: MockProduct[] = [
  { id: "p1", name: "Civic Downpipe", sku: "DP-001" },
  { id: "p2", name: "RS3 Intake", sku: "IN-002" },
];
let mockProducts: MockProduct[] = [...DEFAULT_PRODUCTS];

vi.mock("../data/catalog", async (orig) => ({
  ...((await orig()) as object),
  useProducts: () => ({ data: mockProducts, isLoading: false }),
  useUpdateProductPrice: () => ({ mutateAsync: mockUpdatePrice, isPending: false }),
}));
vi.mock("../data/purchasing", async (orig) => ({
  ...((await orig()) as object),
  useAddPOLine: () => ({ mutateAsync: mockAdd, isPending: false }),
}));

import { AddLine, RepricePanel, RepriceDialog } from "./PurchaseOrderDetail";

afterEach(() => {
  cleanup();
  mockAdd.mockClear();
  mockUpdatePrice.mockClear();
  mockProducts = [...DEFAULT_PRODUCTS];
});

const renderAddLine = () => render(<MemoryRouter><AddLine poId="po1" freightVendors={[]} poFreightName={null} /></MemoryRouter>);

test("PO-line product selector OPENS, lists catalogue products, and selecting + qty adds the line", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  renderAddLine();

  // it OPENS on click and lists the catalogue products
  await user.click(screen.getByRole("combobox", { name: /product/i }));
  expect(await screen.findByRole("option", { name: /Civic Downpipe/ })).toBeTruthy();
  expect(screen.getByRole("option", { name: /RS3 Intake/ })).toBeTruthy();

  // selecting fires the change, and adding posts the line with the chosen product
  await user.click(screen.getByRole("option", { name: /RS3 Intake/ }));
  await user.type(screen.getByLabelText("Qty"), "5");
  await user.click(screen.getByRole("button", { name: /add line/i }));
  expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ purchase_order_id: "po1", product_id: "p2", qty_ordered: 5 }));
});

test("reprice review shows the markup a price yields on the new cost, and its Reprice button targets that product", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const onReprice = vi.fn();
  // cost 8,900 · retail 12,000 → (12000-8900)/8900 = 35% markup
  render(
    <MemoryRouter>
      <RepricePanel items={[{ id: "p1", name: "Civic Downpipe", cost: 8900, retail: 12000, reseller: 10000 }]} editable onReprice={onReprice} />
    </MemoryRouter>,
  );
  expect(screen.getByText(/35% markup/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /reprice/i }));
  expect(onReprice).toHaveBeenCalledWith("p1");
});

test("the reprice dialog shows the current cost and saves retail + reseller together", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  mockProducts = [{ id: "p1", name: "Civic Downpipe", sku: "DP-001", price_pkr: 12000, reseller_price_pkr: 10000, weighted_avg_cost_pkr: 8900 }];
  render(<MemoryRouter><RepriceDialog productId="p1" onClose={() => {}} /></MemoryRouter>);

  expect(screen.getByRole("dialog", { name: /Reprice: Civic Downpipe/i })).toBeTruthy();
  const retail = screen.getByLabelText("Retail price");
  await user.clear(retail);
  await user.type(retail, "14900");
  await user.click(screen.getByRole("button", { name: /save price/i }));
  expect(mockUpdatePrice).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", price_pkr: 14900, reseller_price_pkr: 10000 }));
});

test("empty catalogue shows a hint to add a product first — not a dead, un-openable select", () => {
  mockProducts = [];
  renderAddLine();
  expect(screen.getByText(/No products in the catalogue yet/i)).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
  mockProducts = [
    { id: "p1", name: "Civic Downpipe", sku: "DP-001" },
    { id: "p2", name: "RS3 Intake", sku: "IN-002" },
  ];
});
