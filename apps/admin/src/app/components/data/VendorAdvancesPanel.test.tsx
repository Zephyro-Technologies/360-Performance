import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { buildTrajectory } from "./VendorAdvancesPanel";
import type { VendorBalance, VendorEntry } from "../../data/vendorAdvances";

const vendors: VendorBalance[] = [
  { vendor_account_id: "v1", name: "Payment Vendor", role: "payment", supplier_id: null, balance_pkr: 700 },
  { vendor_account_id: "v2", name: "Air Freight Vendor", role: "air_freight", supplier_id: null, balance_pkr: 0 },
  { vendor_account_id: "v3", name: "Sea Freight Vendor", role: "sea_freight", supplier_id: null, balance_pkr: 0 },
];
// newest-first, as useVendorLedger returns them
const entries: VendorEntry[] = [
  { id: "e2", vendor_account_id: "v1", kind: "drawdown", amount_pkr: 300, occurred_on: "2026-02-10", note: null, reverses_id: null, created_at: "2026-02-10T00:00:00Z", vendor_accounts: { name: "Payment Vendor", role: "payment" } },
  { id: "e1", vendor_account_id: "v1", kind: "topup", amount_pkr: 1000, occurred_on: "2026-01-05", note: null, reverses_id: null, created_at: "2026-01-05T00:00:00Z", vendor_accounts: { name: "Payment Vendor", role: "payment" } },
];

// --- pure trajectory: cumulative PKR running balance, full history, held flat to today ---
test("buildTrajectory: zero baseline -> cumulative PKR running balance -> flat to today (keyed by account id)", () => {
  const { rows } = buildTrajectory(vendors, entries, "2026-03-01");
  expect(rows.map((r) => r.date)).toEqual(["2026-01-04", "2026-01-05", "2026-02-10", "2026-03-01"]);
  expect(rows.map((r) => r.v1)).toEqual([0, 1000, 700, 700]); // PKR running balance, keyed by PK
  expect(rows.every((r) => r.v2 === 0 && r.v3 === 0)).toBe(true);
});

test("buildTrajectory: a lone first-day top-up still plots (>=2 points, not a blank chart)", () => {
  const v: VendorBalance[] = [{ vendor_account_id: "p", name: "Payment", role: "payment", supplier_id: null, balance_pkr: 1000 }];
  const e: VendorEntry[] = [
    { id: "x", vendor_account_id: "p", kind: "topup", amount_pkr: 1000, occurred_on: "2026-05-10", note: null, reverses_id: null, created_at: "2026-05-10T00:00:00Z", vendor_accounts: { name: "Payment", role: "payment" } },
  ];
  const { rows } = buildTrajectory(v, e, "2026-05-10"); // top-up dated "today"
  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(rows.map((r) => r.p)).toEqual([0, 1000]); // baseline 0 then the top-up
});

test("buildTrajectory: seeds the opening balance so the series ends at the authoritative total (truncated window)", () => {
  const v: VendorBalance[] = [{ vendor_account_id: "p", name: "Payment", role: "payment", supplier_id: null, balance_pkr: 5000 }];
  // view says 5000, but only ONE entry (+1000) is loaded (older rows truncated) -> opening 4000
  const e: VendorEntry[] = [
    { id: "x", vendor_account_id: "p", kind: "topup", amount_pkr: 1000, occurred_on: "2026-05-01", note: null, reverses_id: null, created_at: "2026-05-01T00:00:00Z", vendor_accounts: { name: "Payment", role: "payment" } },
  ];
  const { rows } = buildTrajectory(v, e, "2026-05-10");
  expect(rows[0].p).toBe(4000); // backfilled opening baseline
  expect(rows[rows.length - 1].p).toBe(5000); // ends at the headline balance
});

test("buildTrajectory: empty ledger -> no rows", () => {
  expect(buildTrajectory(vendors, [], "2026-03-01").rows).toEqual([]);
});

// --- component: not-P&L framing + PKR-native headline ---
vi.mock("../../data/vendorAdvances", () => ({
  useVendorBalances: () => ({ data: vendors }),
  useVendorLedger: () => ({ data: entries }),
  VENDOR_ROLE_LABEL: { payment: "Payment", air_freight: "Air Freight", sea_freight: "Sea Freight" },
}));
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Stub, LineChart: Stub, Line: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, Legend: () => null };
});

import { VendorAdvancesPanel } from "./VendorAdvancesPanel";

afterEach(cleanup);

const renderPanel = () => render(<MemoryRouter><VendorAdvancesPanel /></MemoryRouter>);

test("panel is framed as NOT-P&L and shows the PKR balance directly (no RMB, no conversion)", () => {
  renderPanel();
  expect(screen.getByText(/Working Capital/i)).toBeTruthy();
  expect(screen.getByText(/not revenue \/ profit/i)).toBeTruthy();
  expect(screen.getByText(/separate from the profit figures above/i)).toBeTruthy();
  expect(screen.getAllByText(/700/).length).toBeGreaterThan(0); // total parked + the payment vendor's line, in PKR
});
