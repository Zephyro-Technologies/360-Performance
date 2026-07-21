import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// The board replaced the Pipeline table. These guard: (1) graduation needs a product + vendor,
// (2) the critical rule that arrival is NOT a status flip — a transit PO offers "Receive" (which
// routes to the receive_po_line flow), and an arrived PO has no forward action, so a drag/click can
// never fake `received` without stock, and (3) filters actually narrow the board.
const mockGraduate = vi.fn().mockResolvedValue("po-new");

const ready = {
  id: "p1", item_name: "Graduatable Item", product_id: "pr1", supplier_id: "s1", planned_qty: 5,
  est_unit_cost_pkr: 3000, target_retail_pkr: null, priority: "high", status: "approved", notes: null,
  graduated_to_po_id: null, products: { name: "Prod", sku: "PR-1", category_id: "c1" }, suppliers: { name: "FY MOTO" }, purchase_orders: null,
};
const freeText = {
  id: "p2", item_name: "Free-text Research", product_id: null, supplier_id: null, planned_qty: null,
  est_unit_cost_pkr: null, target_retail_pkr: null, priority: "low", status: "researching", notes: null,
  graduated_to_po_id: null, products: null, suppliers: null, purchase_orders: null,
};
const transitPO = {
  id: "po1", po_no: "PO-1", supplier_id: "s1", status: "in_transit", frozen_rate_rmb_pkr: 40,
  ordered_on: null, expected_on: null, received_on: null, created_at: "2026-01-01", suppliers: { name: "Rui Cheng" }, line_count: 2, category_ids: ["c1"],
};
const receivedPO = {
  id: "po2", po_no: "PO-2", supplier_id: "s1", status: "received", frozen_rate_rmb_pkr: 40,
  ordered_on: null, expected_on: null, received_on: "2026-07-01", created_at: "2026-01-01", suppliers: { name: "Guang Auto" }, line_count: 2, category_ids: ["c1"],
};
const due = { purchase_order_id: "po1", po_no: "PO-1", supplier_id: "s1", cost: 100000, paid: 40000, due: 60000, credit: 0 };

vi.mock("../../data/purchasing", async (orig) => ({
  ...((await orig()) as object),
  usePurchaseOrders: () => ({ data: [transitPO, receivedPO], isLoading: false }),
  usePODues: () => ({ data: [due], isLoading: false }),
  useUpdatePurchaseOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../data/pipeline", async (orig) => ({
  ...((await orig()) as object),
  usePlannedPurchases: () => ({ data: [ready, freeText], isLoading: false }),
  useCreatePlanned: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePlanned: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePlanned: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useGraduatePlanned: () => ({ mutateAsync: mockGraduate, isPending: false }),
}));
vi.mock("../../data/catalog", async (orig) => ({
  ...((await orig()) as object),
  useSuppliers: () => ({ data: [] }),
  useProducts: () => ({ data: [] }),
  useCategories: () => ({ data: [] }),
}));
vi.mock("../../data/auth", () => ({ useAuth: () => ({ can: () => true }) }));

import { PurchaseBoard } from "./PurchaseBoard";
import { ConfirmProvider } from "../common/confirm";

afterEach(() => {
  cleanup();
  mockGraduate.mockClear();
});

test("planned items only graduate with a product + vendor; a ready one fires, and POs show their money chip", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<ConfirmProvider><MemoryRouter><PurchaseBoard /></MemoryRouter></ConfirmProvider>);

  expect(screen.getByText("Graduatable Item")).toBeTruthy();
  expect(screen.getByText("Free-text Research")).toBeTruthy();
  expect(screen.getByText(/not a product yet/i)).toBeTruthy();

  expect(screen.getByText("Rui Cheng")).toBeTruthy();
  expect(screen.getByText("Partial")).toBeTruthy();

  const readyCard = screen.getByText("Graduatable Item").closest("[data-plan-card]") as HTMLElement;
  const freeCard = screen.getByText("Free-text Research").closest("[data-plan-card]") as HTMLElement;
  const readyBtn = within(readyCard).getByRole("button", { name: /to po/i }) as HTMLButtonElement;
  const freeBtn = within(freeCard).getByRole("button", { name: /to po/i }) as HTMLButtonElement;
  expect(readyBtn.disabled).toBe(false);
  expect(freeBtn.disabled).toBe(true);

  await user.click(readyBtn);
  expect(mockGraduate).toHaveBeenCalledWith("p1");
});

test("arrival is never a status flip: a transit PO offers Receive, an arrived PO has no forward action", () => {
  render(<ConfirmProvider><MemoryRouter><PurchaseBoard /></MemoryRouter></ConfirmProvider>);

  // The transit card's forward action routes to receiving — there is no "advance to received".
  expect(screen.getByRole("button", { name: /receive PO-1/i })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /to received|to arrived/i })).toBeNull();

  // The received PO sits in Arrived and exposes no stage-move button (arrival is terminal here).
  const receivedCard = screen.getByText("Guang Auto").closest('[role="button"]') as HTMLElement;
  expect(within(receivedCard).queryByRole("button")).toBeNull();
});

test("search filter narrows the board to matching cards", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<ConfirmProvider><MemoryRouter><PurchaseBoard /></MemoryRouter></ConfirmProvider>);

  await user.type(screen.getByPlaceholderText(/search PO/i), "Rui");

  expect(screen.getByText("Rui Cheng")).toBeTruthy(); // PO-1 matches
  expect(screen.queryByText("Guang Auto")).toBeNull(); // PO-2 filtered out
  expect(screen.queryByText("Graduatable Item")).toBeNull(); // planned items filtered out
});
