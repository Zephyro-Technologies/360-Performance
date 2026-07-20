// Regression guard: editing an order must NOT destroy its one-off (product-less) lines.
//
// update_order deletes every order_item and re-inserts from the payload, so any line the dialog
// fails to send is permanently deleted along with its money. The dialog used to seed its draft
// with `order_items.filter(it => it.product_id)`, which silently dropped one-off lines: opening
// Edit and pressing Save with no changes shrank the order total while the invoice still billed
// the full amount.
import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock("../../data/catalog", async (orig) => ({
  ...((await orig()) as object),
  useProducts: () => ({ data: [], isLoading: false }),
}));
vi.mock("../../data/orders", async (orig) => ({
  ...((await orig()) as object),
  useUpdateOrder: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

import { OrderEditDialog } from "./OrderEditDialog";
import type { OrderRow } from "../../data/orders";

afterEach(() => {
  cleanup();
  mockUpdate.mockClear();
});

// One catalogue line (10,000) + one one-off line (5,000) = 15,000.
const order = {
  id: "o1",
  order_no: "ORD-1200",
  total_pkr: 15000,
  order_items: [
    {
      id: "i1", product_id: "p1", name: "Civic Downpipe", sku: "DP-001", qty: 1, price_pkr: 10000,
      list_price_pkr: null, discount_pct: 0, discount_pkr: 0, qty_delivered: 0,
      oneoff_product_id: null, landed_cost_pkr: null,
    },
    {
      id: "i2", product_id: null, name: "Custom bracket", sku: "CB-9", qty: 1, price_pkr: 5000,
      list_price_pkr: null, discount_pct: 0, discount_pkr: 0, qty_delivered: 0,
      oneoff_product_id: "oo1", landed_cost_pkr: 3000,
    },
  ],
  order_stage_events: [],
} as unknown as OrderRow;

test("saving an unchanged order preserves its one-off line — total and payload both intact", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<OrderEditDialog order={order} open onOpenChange={() => {}} />);

  // Both lines are seeded into the draft, so the running total is the full order value.
  expect(screen.getByText("Custom bracket")).toBeTruthy();
  expect(screen.getByText("Rs 15,000")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: /save changes/i }));

  expect(mockUpdate).toHaveBeenCalledTimes(1);
  const payload = mockUpdate.mock.calls[0][0] as {
    id: string;
    items: { product_id: string; qty: number; price_pkr: number; oneoff_product_id?: string | null; landed_cost_pkr?: number }[];
  };
  expect(payload.id).toBe("o1");
  expect(payload.items).toHaveLength(2);

  // The catalogue line round-trips by product_id.
  expect(payload.items).toContainEqual(expect.objectContaining({ product_id: "p1", qty: 1, price_pkr: 10000 }));
  // The one-off line round-trips as a product-less line, carrying the catalogue link and the
  // cost snapshot the P&L reads — losing landed_cost_pkr would book it at 100% margin.
  expect(payload.items).toContainEqual(
    expect.objectContaining({
      product_id: "",
      name: "Custom bracket",
      qty: 1,
      price_pkr: 5000,
      oneoff_product_id: "oo1",
      landed_cost_pkr: 3000,
    }),
  );
});

test("a one-off-only order is still editable (Save is not disabled by an empty draft)", async () => {
  const oneoffOnly = { ...order, order_items: [order.order_items[1]] } as OrderRow;
  render(<OrderEditDialog order={oneoffOnly} open onOpenChange={() => {}} />);

  expect(screen.queryByText(/No items\./)).toBeNull();
  expect(screen.getByRole("button", { name: /save changes/i }).hasAttribute("disabled")).toBe(false);
});
