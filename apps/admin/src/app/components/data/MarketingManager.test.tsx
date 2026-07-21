import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../data/marketing", async (orig) => ({
  ...((await orig()) as object),
  useMarketingSpend: () => ({ data: { cash_pkr: 10000, pr_gift_pkr: 90000, total_pkr: 100000 } }),
  usePrGifts: () => ({ data: [], isLoading: false }),
  useGiftPr: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePrGift: () => ({ mutateAsync: vi.fn() }),
  useCashMarketing: () => ({ data: [], isLoading: false }),
  useAddCashMarketing: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCashMarketing: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../data/catalog", () => ({
  useProducts: () => ({
    data: [
      { id: "h1", name: "House InStock", sku: "H-1", owner_kind: "house", on_hand_qty: 5 },
      { id: "h0", name: "House NoStock", sku: "H-0", owner_kind: "house", on_hand_qty: 0 },
      { id: "i1", name: "Investor Prod", sku: "I-1", owner_kind: "investor", on_hand_qty: 9 },
    ],
  }),
}));
vi.mock("../../data/auth", () => ({ useAuth: () => ({ can: () => true }) }));

import { MarketingManager } from "./MarketingManager";
import { ConfirmProvider } from "../common/confirm";

afterEach(() => cleanup());

test("PR-gift dialog offers ONLY house stock with on-hand — never investor stock or empty stock", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<ConfirmProvider><MarketingManager /></ConfirmProvider>);

  expect(screen.getByText(/total marketing/i)).toBeTruthy();

  await user.click(screen.getByRole("button", { name: /record pr gift/i }));
  await user.click(screen.getByRole("combobox", { name: /^product$/i }));

  expect(screen.getByText(/House InStock/)).toBeTruthy(); // house + on hand → giftable
  expect(screen.queryByText(/Investor Prod/)).toBeNull(); // investor capital is never giftable
  expect(screen.queryByText(/House NoStock/)).toBeNull(); // nothing on hand
});
