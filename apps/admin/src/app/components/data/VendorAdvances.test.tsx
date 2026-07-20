import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const balances = [
  { vendor_account_id: "v1", name: "Payment Vendor", role: "payment", balance_pkr: 1000 },
  { vendor_account_id: "v2", name: "Air Freight Vendor", role: "air_freight", balance_pkr: 500 },
  { vendor_account_id: "v3", name: "Sea Freight Vendor", role: "sea_freight", balance_pkr: 0 },
];
const ledger = [
  { id: "e1", vendor_account_id: "v1", kind: "topup", amount_pkr: 1000, occurred_on: "2026-06-20", note: "wire 1", reverses_id: null, created_at: "2026-06-20T00:00:00Z", vendor_accounts: { name: "Payment Vendor", role: "payment" } },
];

vi.mock("../../data/vendorAdvances", () => ({
  useVendorBalances: () => ({ data: balances }),
  useVendorLedger: () => ({ data: ledger, isLoading: false, isError: false }),
  useReverseAdvance: () => ({ mutateAsync: vi.fn() }),
  useCreateVendorAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
  VENDOR_ROLE_LABEL: { payment: "Payment", air_freight: "Air Freight", sea_freight: "Sea Freight" },
  vendorTag: (b: { role: string | null }) => (b.role ? ({ payment: "Payment", air_freight: "Air Freight", sea_freight: "Sea Freight" } as Record<string, string>)[b.role] : "Supplier"),
}));
vi.mock("../../data/auth", () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock("./VendorAdvanceDialog", () => ({ VendorAdvanceDialog: () => null }));

import { VendorAdvances } from "./VendorAdvances";

afterEach(cleanup);

test("summary shows PKR balances directly, framed as not-P&L; ledger renders", () => {
  render(<VendorAdvances />);
  expect(screen.getAllByText(/1,000/).length).toBeGreaterThan(0); // v1 balance + the top-up amount, PKR
  expect(screen.getByText(/1,500/)).toBeTruthy(); // total parked = 1000 + 500 + 0
  expect(screen.getByText(/not revenue/i)).toBeTruthy(); // kept separate from P&L
  // The ledger calls a top-up a "Payment" — the operator's word for money sent to a vendor.
  expect(screen.getAllByText("Payment").length).toBeGreaterThan(0);
  expect(screen.queryByText("Top-up")).toBeNull();
  expect(screen.getByRole("button", { name: /make payment/i })).toBeTruthy();
});
