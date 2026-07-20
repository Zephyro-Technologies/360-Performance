import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

// Keep the real productSchema + deriveAvailability; only stub the data hooks.
vi.mock("../../data/catalog", async (orig) => ({
  ...((await orig()) as object),
  useCategories: () => ({ data: [] }),
  useSuppliers: () => ({ data: [] }),
  useBrandOptions: () => ({ data: [] }),
  useSaveProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../data/investors", () => ({ useInvestorDeals: () => ({ data: [] }), dealLabel: (d: { id: string }) => d.id }));
vi.mock("../../data/settings", () => ({ useLowStockDefault: () => ({ data: 3 }) }));
vi.mock("./CategorySelect", () => ({ CategorySelect: () => null }));

import { ProductDialog } from "./ProductDialog";

afterEach(cleanup);

test("availability is ONE explicit choice; a new product defaults to Made to order with no stock fields", () => {
  render(<ProductDialog product={null} open onOpenChange={() => {}} />);
  // the single Availability control
  expect(screen.getByText("Track stock")).toBeTruthy();
  expect(screen.getByText("Made to order")).toBeTruthy();
  // default = made-to-order → no quantity fields, and the old override toggle is gone
  expect(screen.queryByText("Stock quantity")).toBeNull();
  expect(screen.queryByText(/Force made-to-order/)).toBeNull();
});

test("choosing Track stock reveals the low-stock threshold (stock itself comes from batches)", () => {
  render(<ProductDialog product={null} open onOpenChange={() => {}} />);
  fireEvent.click(screen.getByText("Track stock"));
  expect(screen.getByText("Low-stock threshold")).toBeTruthy();
  expect(screen.queryByText("Stock quantity")).toBeNull(); // no manual stock entry — derived from received POs

  // Blank = follow the catalogue default (3 here); typing a number overrides it for this product.
  const threshold = screen.getByLabelText("Low-stock threshold") as HTMLInputElement;
  expect(threshold.value).toBe("");
  expect(threshold.placeholder).toBe("Default (3)");
  expect(screen.getByText(/Following the catalogue default of 3/)).toBeTruthy();

  fireEvent.change(threshold, { target: { value: "10" } });
  expect(screen.getByText(/Overriding the catalogue default of 3/)).toBeTruthy();
});
