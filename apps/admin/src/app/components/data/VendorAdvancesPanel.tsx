// Working Capital panel for the Analytics page — vendor-advance balances + the
// full-history balance-over-time trajectory.
//
// GUARDRAIL: this is prepaid credit, NOT revenue/profit. The panel is a visually
// distinct bottom-of-page section, badged accordingly, kept away from the P&L cards.
// It reads ONLY the vendor-advance ledger (never an analytics P&L view), reconstructs
// the trajectory client-side, and alters no Money-in/out/kept figure.
//
// PKR-native: the 3 logistics vendors are paid in PKR, so the balance, the per-vendor
// lines, and the trend are all PKR directly — no RMB, no live conversion.
import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowRight, Wallet } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useVendorBalances,
  useVendorLedger,
  VENDOR_ROLE_LABEL,
  type VendorBalance,
  type VendorEntry,
  type VendorRole,
} from "../../data/vendorAdvances";
import { formatCompact, formatDate, formatPKR } from "@360/lib/format";

const ROLE_ORDER: VendorRole[] = ["payment", "air_freight", "sea_freight"];
// Non-red palette so the section never reads like the P&L (which is red/#cc0000).
const ROLE_COLOR: Record<VendorRole, string> = {
  payment: "#4f46e5", // indigo
  air_freight: "#0ea5e9", // sky
  sea_freight: "#14b8a6", // teal
};
const dayMs = (iso: string) => Date.parse(iso + "T00:00:00Z");

type TrajRow = { date: string; t: number; [accountId: string]: number | string };

// Pure: reconstruct each vendor's cumulative PKR balance over the loaded ledger history.
// Series are keyed by vendor_account_id (the PK — role is for labels only). Each vendor's
// running balance is seeded with its OPENING balance = authoritative view balance − net of
// the loaded entries: 0 when all entries are loaded, but if PostgREST truncated older rows
// (>1000) it backfills the missing baseline so the series still ENDS at the headline total.
// A baseline point is prepended before the first movement so the line always has >=2 points
// (a lone first-day top-up still plots); a final flat point at `todayIso` carries to today.
export function buildTrajectory(vendors: VendorBalance[], entries: VendorEntry[], todayIso: string) {
  const ordered = [...vendors].sort((a, b) => ROLE_ORDER.indexOf(a.role as VendorRole) - ROLE_ORDER.indexOf(b.role as VendorRole));
  if (ordered.length === 0 || entries.length === 0) return { rows: [] as TrajRow[], vendors: ordered };

  const signed = (e: VendorEntry) => (e.kind === "topup" ? e.amount_pkr : -e.amount_pkr);
  const asc = [...entries].sort((a, b) =>
    a.occurred_on !== b.occurred_on ? (a.occurred_on < b.occurred_on ? -1 : 1) : a.created_at < b.created_at ? -1 : 1,
  );

  const loadedNet: Record<string, number> = {};
  ordered.forEach((v) => (loadedNet[v.vendor_account_id] = 0));
  for (const e of asc) loadedNet[e.vendor_account_id] = (loadedNet[e.vendor_account_id] ?? 0) + signed(e);
  const running: Record<string, number> = {};
  ordered.forEach((v) => (running[v.vendor_account_id] = v.balance_pkr - (loadedNet[v.vendor_account_id] ?? 0)));

  const snap = (iso: string): TrajRow => {
    const row: TrajRow = { date: iso, t: dayMs(iso) };
    for (const v of ordered) row[v.vendor_account_id] = running[v.vendor_account_id] ?? 0;
    return row;
  };

  const rows: TrajRow[] = [];
  const firstBaseline = new Date(asc[0].occurred_on + "T00:00:00Z");
  firstBaseline.setUTCDate(firstBaseline.getUTCDate() - 1);
  rows.push(snap(firstBaseline.toISOString().slice(0, 10))); // opening level, day before first movement

  let cur = "";
  for (const e of asc) {
    if (cur && e.occurred_on !== cur) rows.push(snap(cur));
    running[e.vendor_account_id] = (running[e.vendor_account_id] ?? 0) + signed(e);
    cur = e.occurred_on;
  }
  if (cur) rows.push(snap(cur));
  if (cur && cur < todayIso) rows.push(snap(todayIso)); // hold flat to today
  return { rows, vendors: ordered };
}

export function VendorAdvancesPanel() {
  const balancesQ = useVendorBalances();
  const ledgerQ = useVendorLedger();

  // Working Capital tracks the logistics vendors' prepaid credit only; product suppliers (role null)
  // are managed in the Vendor Advances tab and excluded from this freight-focused chart.
  const balances = useMemo(() => (balancesQ.data ?? []).filter((b) => b.role != null), [balancesQ.data]);
  const logisticsIds = useMemo(() => new Set(balances.map((b) => b.vendor_account_id)), [balances]);
  const entries = useMemo(() => (ledgerQ.data ?? []).filter((e) => logisticsIds.has(e.vendor_account_id)), [ledgerQ.data, logisticsIds]);

  const { rows, vendors } = useMemo(
    () => buildTrajectory(balances, entries, new Date().toISOString().slice(0, 10)),
    [balances, entries],
  );

  const loading = balancesQ.isLoading || ledgerQ.isLoading;
  const failed = balancesQ.isError || ledgerQ.isError;

  const totalPkr = vendors.reduce((s, v) => s + v.balance_pkr, 0);
  const last = entries[0]; // useVendorLedger orders newest-first

  return (
    <section className="mt-8 border-t border-border pt-8">
      <div className="rounded-md border border-border bg-secondary/30 p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 [font-family:var(--font-heading)] uppercase tracking-wide">
            <Wallet className="size-4 text-muted-foreground" /> Working Capital · Vendor Advances
          </h2>
          <span className="rounded-full bg-background px-2.5 py-0.5 text-xs text-muted-foreground">prepaid credit · not revenue / profit</span>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Money parked with suppliers as prepaid credit, separate from the profit figures above.
        </p>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading working capital…</p>
        ) : failed ? (
          <p className="py-10 text-center text-sm text-[#cc0000]">Couldn&apos;t load vendor advances. Try refreshing.</p>
        ) : (
          <>
            {/* Headline: total parked (PKR) + per-vendor concentration */}
            <div className="mb-5 flex flex-wrap items-end gap-x-10 gap-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total parked</p>
                <p className="[font-family:var(--font-heading)] text-2xl font-bold tabular-nums">{formatPKR(totalPkr)}</p>
              </div>
              <div className="flex flex-wrap gap-x-7 gap-y-2">
                {vendors.map((v) => {
                  const share = totalPkr > 0 ? Math.round((v.balance_pkr / totalPkr) * 100) : 0;
                  return (
                    <div key={v.vendor_account_id}>
                      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ backgroundColor: ROLE_COLOR[v.role as VendorRole] }} />
                        {VENDOR_ROLE_LABEL[v.role as VendorRole]}
                      </p>
                      <p className="tabular-nums">
                        <span className="font-medium">{formatPKR(v.balance_pkr)}</span>{" "}
                        <span className="text-xs text-muted-foreground">· {share}%</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Balance-over-time (PKR, full history, time-proportional axis) */}
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing recorded yet. Make a payment in Vendor Advances to start the trajectory.
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">Balance over time (PKR). Full history; one line per vendor.</p>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows} margin={{ left: -8, right: 8, top: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                      <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t) => new Date(Number(t)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                        tick={{ fontSize: 11 }}
                        stroke="#999"
                        minTickGap={40}
                      />
                      <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11 }} stroke="#999" width={64} />
                      <Tooltip
                        formatter={(value, name) => [formatPKR(Number(value)), String(name)]}
                        labelFormatter={(t) => formatDate(new Date(Number(t)).toISOString().slice(0, 10))}
                        contentStyle={{ borderRadius: 6, border: "1px solid #e5e5e5", fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {vendors.map((v) => (
                        <Line
                          key={v.vendor_account_id}
                          type="stepAfter"
                          dataKey={v.vendor_account_id}
                          name={VENDOR_ROLE_LABEL[v.role as VendorRole]}
                          stroke={ROLE_COLOR[v.role as VendorRole]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {last
                  ? `Last entry: ${last.kind === "topup" ? "payment" : "draw-down"} ${formatPKR(last.amount_pkr)} with ${last.vendor_accounts?.name ?? "a vendor"} on ${formatDate(last.occurred_on)}.`
                  : "Nothing recorded yet."}
              </span>
              <Link to="/finance?tab=advances" className="inline-flex items-center gap-1 font-medium text-[#cc0000] hover:underline">
                Manage in Vendor Advances <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
