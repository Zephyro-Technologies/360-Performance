import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateDeal = vi.fn().mockResolvedValue(undefined);
vi.mock("../../data/investors", () => ({
  useInvestors: () => ({ data: [{ id: "i1", name: "Farhan", contact: null, phone: null, notes: null, active: true }] }),
  useInvestorDeals: () => ({ data: [] }),
  useCreateInvestor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateInvestorDeal: () => ({ mutateAsync: mockCreateDeal, isPending: false }),
}));
vi.mock("../../data/auth", () => ({ useAuth: () => ({ can: () => true }) }));

import { InvestorsManager } from "./InvestorsManager";

afterEach(() => {
  cleanup();
  mockCreateDeal.mockClear();
});

test("New deal: the investor selector OPENS, lists investors, and a 50% split is stored as the 0.5 fraction", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<InvestorsManager />);

  await user.click(screen.getByRole("button", { name: /new deal/i }));
  await user.click(screen.getByRole("combobox", { name: /investor/i }));
  await user.click(await screen.findByRole("option", { name: /Farhan/ }));
  await user.click(screen.getByRole("button", { name: /create deal/i }));

  // UI works in whole percent (default 50); the data layer stores the fraction.
  expect(mockCreateDeal).toHaveBeenCalledWith(expect.objectContaining({ investor_id: "i1", split_pct: 0.5 }));
});
