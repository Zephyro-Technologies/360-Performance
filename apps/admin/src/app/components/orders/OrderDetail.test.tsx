import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const { mockRecord, order, authState, products } = vi.hoisted(() => ({
  mockRecord: vi.fn().mockResolvedValue(undefined),
  authState: { admin: true },
  products: [] as { id: string; name: string; availability: string; on_hand_qty: number }[],
  order: {
    id: "o1", order_no: "ORD-1001", stage: "delivered", notes: null, total_pkr: 100000,
    customers: { name: "Cust", city: "KHI", email: null, phone: null, type: "retail" },
    order_items: [{ id: "oi1", product_id: "p1", name: "Widget", sku: "W-1", qty: 2, price_pkr: 50000, qty_delivered: 2, source_purchase_order_id: null }],
    order_stage_events: [],
  },
}));

vi.mock("../../data/orders", async (orig) => ({
  ...((await orig()) as object),
  useOrders: () => ({ data: [] }),
  useUpdateOrderNotes: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFulfilOrderLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOrderCosts: () => ({ isLoading: false, data: { cogs_pkr: 0 } }),
}));
vi.mock("../../data/purchasing", () => ({ usePurchaseOrders: () => ({ data: [] }) }));
vi.mock("../../data/catalog", async (orig) => ({ ...((await orig()) as object), useProducts: () => ({ data: products }) }));
vi.mock("../../data/invoices", () => ({
  useOrderInvoice: () => ({ isLoading: false, data: null }),
  useOrderInvoiceLines: () => ({ isLoading: false, data: [] }),
}));
vi.mock("../../data/quotations", () => ({
  useOrderQuotations: () => ({ isLoading: false, data: [] }),
  useQuotation: () => ({ data: null }),
}));
vi.mock("../../data/corrections", async (orig) => ({
  ...((await orig()) as object),
  useOrderCorrections: () => ({ data: [] }),
  useRecordCorrection: () => ({ mutateAsync: mockRecord, isPending: false }),
  useOrderRefundablePayments: () => ({ data: [] }),
}));
vi.mock("../../data/auth", () => ({ useAuth: () => ({ can: (c: string) => authState.admin || c !== "manage" }) }));

import { OrderDetail } from "./OrderDetail";

afterEach(() => { cleanup(); mockRecord.mockClear(); products.length = 0; });

test("the correction dialog offers Refund only to an admin (staff sees replacement + compensation)", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });

  // admin: refund is offered
  authState.admin = true;
  render(<MemoryRouter><OrderDetail order={order as never} open onOpenChange={() => {}} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "Record" }));
  await user.click(screen.getByRole("combobox", { name: "Action" }));
  expect(screen.getByText(/Refund \(reverse a payment\)/i)).toBeTruthy();
  expect(screen.getByText(/Compensation \(goodwill\)/i)).toBeTruthy();
  cleanup();

  // staff: refund is hidden (real enforcement is DB RLS; this is UX)
  authState.admin = false;
  render(<MemoryRouter><OrderDetail order={order as never} open onOpenChange={() => {}} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "Record" }));
  await user.click(screen.getByRole("combobox", { name: "Action" }));
  expect(screen.getByText(/Compensation \(goodwill\)/i)).toBeTruthy();
  expect(screen.queryByText(/Refund \(reverse a payment\)/i)).toBeNull();
});

test("an out-of-stock, undelivered line shows the badge and a restock link to Purchasing (pre-filled with product + shortfall)", () => {
  authState.admin = true;
  products.push({ id: "p1", name: "Widget", availability: "out_of_stock", on_hand_qty: 0 });
  const shortOrder = {
    ...order,
    stage: "received",
    order_items: [{ id: "oi1", product_id: "p1", name: "Widget", sku: "W-1", qty: 3, price_pkr: 50000, qty_delivered: 1, source_purchase_order_id: null }],
  };
  render(<MemoryRouter><OrderDetail order={shortOrder as never} open onOpenChange={() => {}} /></MemoryRouter>);
  expect(screen.getByText("Out of stock")).toBeTruthy();
  const link = screen.getByRole("link", { name: /restock/i });
  // outstanding = qty 3 - delivered 1 = 2
  expect(link.getAttribute("href")).toBe("/purchasing?restock=p1&qty=2");
});
