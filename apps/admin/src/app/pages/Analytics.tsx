// Module 2 — Reporting & Analytics. Plain English. All money comes from the DB
// views (analytics_daily = netted paid revenue + expenses; invoice_balances =
// receivables). Date-range aware throughout; "what's selling" rolls leaves up to
// their parent category with drill-down.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  ChevronDown,
  ChevronRight,
  KanbanSquare,
  Package,
  ShoppingBag,
  Star,
} from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { usePeriodParams } from "../lib/usePeriodParams";
import { useToday } from "../lib/useToday";
import { buildChartSeries, grainFor } from "../data/periods";
import { PeriodPicker } from "../components/analytics/PeriodPicker";
import { EmptyPeriodHint } from "../components/analytics/EmptyPeriodHint";
import {
  monthWindows,
  usePnlBetween,
  useAnalyticsDaily,
  useInvoiceBalances,
  useCategorySales,
  useTopCustomer,
} from "../data/analytics";
import { useProducts } from "../data/catalog";
import { useVendorPayables } from "../data/purchasing";
import { useInvestorOwed, usePnlSummary } from "../data/investors";
import { useDeliveries } from "../data/deliveries";
import { useVendorBalances } from "../data/vendorAdvances";
import { useOrders, lineStatus, STAGE_LABEL } from "../data/orders";
import { usePlannedPurchases, STATUS_LABEL, STATUS_FLOW } from "../data/pipeline";
import { VendorAdvancesPanel } from "../components/data/VendorAdvancesPanel";
import { formatCompact, formatPKR } from "@360/lib/format";
import { Skeleton } from "@360/ui/skeleton";
import { cn } from "@360/ui/utils";
import type { PnlBetween } from "../data/analytics";

const EMPTY: never[] = []; // stable empty fallback (keeps useMemo deps stable)

export function Analytics() {
  // The reporting period drives every date-scoped figure on this page — money cards, breakdown,
  // chart, what's-selling, top customer. It defaults to the last COMPLETE calendar month because
  // the client runs salaries off it; on a quiet month that legitimately reads zero, which is what
  // EmptyPeriodHint explains. It lives in the URL (?from&to), so a refresh keeps it and the
  // /insights/* drill-downs inherit it via periodSearch on their hrefs.
  const { period, setPeriod, bounds, isActivityLoading, hasActivityIn, periodSearch } = usePeriodParams();
  const today = useToday();
  const mw = useMemo(() => monthWindows(), []);
  const thisMonthPnl = usePnlBetween(mw.thisStart, mw.thisEnd);
  const lastMonthPnl = usePnlBetween(mw.lastStart, mw.lastEnd);
  const periodPnl = usePnlBetween(period.start, period.end);
  const dailyQ = useAnalyticsDaily();
  const balancesQ = useInvoiceBalances();
  const catQ = useCategorySales(period.start, period.end);
  const topQ = useTopCustomer(period.start, period.end);
  const productsQ = useProducts();
  const payablesQ = useVendorPayables();
  const investorOwedQ = useInvestorOwed();
  const pnlQ = usePnlSummary();
  const deliveriesQ = useDeliveries();
  const advancesQ = useVendorBalances();
  const ordersQ = useOrders();
  const pipelineQ = usePlannedPurchases();
  const [expanded, setExpanded] = useState<string | null>(null);

  const daily = dailyQ.data ?? EMPTY;
  // Lifetime figure for the headline row (all-time, not range-bound).
  const totalRevenue = daily.reduce((s, d) => s + Number(d.revenue_pkr), 0);

  // Buckets by day / week / month depending on the span, so a wide window stays a readable ~120
  // points instead of tens of thousands. (The old version walked one day at a time behind a 1200
  // iteration cap, which silently truncated anything longer than ~3.3 years.)
  const chart = useMemo(() => buildChartSeries(daily, period.start, period.end), [daily, period.start, period.end]);
  const chartGrain = grainFor(period.start, period.end); // "day" | "week" | "month" — labels follow it

  const balances = balancesQ.data ?? [];
  const owedRows = balances.filter((b) => ["unpaid", "partial", "overdue"].includes(b.status));
  const owed = owedRows.reduce((s, b) => s + Number(b.balance_pkr), 0);
  const overdueRows = balances.filter((b) => b.status === "overdue");

  // What's selling — parent rollup (top 5), leaf drill-down, range-aware.
  const rollup = useMemo(() => {
    const rows = catQ.data ?? [];
    const total = rows.reduce((s, r) => s + Number(r.revenue_pkr), 0);
    const parents = new Map<string, { id: string; name: string; value: number; leaves: Map<string, { name: string; value: number }> }>();
    for (const r of rows) {
      const pid = r.rollup_id ?? "uncat";
      const p = parents.get(pid) ?? { id: pid, name: r.rollup_name, value: 0, leaves: new Map() };
      p.value += Number(r.revenue_pkr);
      const lid = r.category_id ?? "uncat";
      const leaf = p.leaves.get(lid) ?? { name: r.category_name, value: 0 };
      leaf.value += Number(r.revenue_pkr);
      p.leaves.set(lid, leaf);
      parents.set(pid, p);
    }
    return {
      total,
      items: [...parents.values()]
        .map((p) => ({
          ...p,
          share: total ? Math.round((p.value / total) * 100) : 0,
          leaves: [...p.leaves.values()].sort((a, b) => b.value - a.value),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    };
  }, [catQ.data]);

  // One predicate for the low/out callout AND the count cards: visible products that are low or
  // out (NOT made-to-order, which is neither) — so the two surfaces can never disagree.
  const lowStock = (productsQ.data ?? []).filter((p) => (p.availability === "low_stock" || p.availability === "out_of_stock") && p.visibility === "visible");

  // Command-center position — every figure straight from its verified view (card = detail).
  const products = productsQ.data ?? [];
  const stockValue = products.reduce((s, p) => s + Number(p.stock_value_pkr ?? 0), 0); // Σ product_cost.stock_value_pkr (batch-exact)
  const lowCount = lowStock.filter((p) => p.availability === "low_stock").length;
  const outCount = lowStock.filter((p) => p.availability === "out_of_stock").length;
  const payables = (payablesQ.data ?? []).reduce((s, v) => s + Number(v.item_owed_pkr) + Number(v.ship_owed_pkr), 0); // vendor_payables A/P
  const investorOwed = (investorOwedQ.data ?? []).reduce((s, i) => s + Number(i.owed_pkr), 0); // investor_owed
  const deliveryOwed = (deliveriesQ.data ?? []).filter((d) => !d.paid_on).reduce((s, d) => s + Number(d.amount_pkr), 0); // unpaid customer delivery
  const advancesParked = (advancesQ.data ?? []).reduce((s, a) => s + Number(a.balance_pkr), 0); // vendor_advance_balances (parked, outside P&L)
  const orders = ordersQ.data ?? [];
  const recentOrders = orders.slice(0, 5);
  const pendingFulfil = orders.filter((o) => o.stage !== "cancelled" && o.order_items.some((it) => it.product_id && lineStatus(it.qty_delivered, it.qty) !== "delivered"));
  const plans = pipelineQ.data ?? [];
  const pipelineCounts = STATUS_FLOW.map((st) => ({ status: st, count: plans.filter((p) => p.status === st).length })).filter((x) => x.count > 0);

  const callouts: { tone: "warn" | "info" | "good"; icon: typeof AlertCircle; text: string; href?: string }[] = [];
  if (overdueRows.length > 0)
    callouts.push({
      tone: "warn",
      icon: AlertCircle,
      text: `${overdueRows.length} invoice${overdueRows.length === 1 ? " is" : "s are"} overdue (${formatPKR(overdueRows.reduce((s, b) => s + Number(b.balance_pkr), 0))}).`,
      href: "/invoices",
    });
  if (lowStock.length > 0)
    callouts.push({
      tone: "info",
      icon: Package,
      text: `${lowStock.length} product${lowStock.length === 1 ? " is" : "s are"} low or out of stock.`,
      href: "/products",
    });
  if (topQ.data)
    callouts.push({
      tone: "good",
      icon: Star,
      text: `Top customer in ${period.label}: ${topQ.data.name} (${formatPKR(topQ.data.net)}).`,
      href: "/data",
    });

  // Show a skeleton on first load, and a friendly "get started" for a brand-new shop —
  // instead of a flash of empty cards / a wall of zeros with no guidance.
  const initialLoading = productsQ.isLoading || ordersQ.isLoading || dailyQ.isLoading;
  const emptyShop = !initialLoading && products.length === 0 && orders.length === 0;
  if (initialLoading || emptyShop) {
    return (
      <div>
        <PageHeader title="Your Shop at a Glance" subtitle={emptyShop ? "Let's get your first numbers in." : "Loading…"} />
        {initialLoading ? <DashboardSkeleton /> : <GetStarted />}
      </div>
    );
  }

  return (
      <div>
        <PageHeader
          title="Your Shop at a Glance"
          subtitle="Plain-English numbers. Pick the reporting period below."
        />

        {/* The period picker drives the full breakdown, chart, what's-selling & top customer,
            and carries into the metric drill-downs via periodSearch. It lives here, not in
            the global topbar. */}
        <div className="mb-3 flex flex-wrap items-end justify-end gap-3">
          <PeriodPicker period={period} onChange={setPeriod} today={today} bounds={bounds} hasActivityIn={hasActivityIn} />
        </div>
        <EmptyPeriodHint
          period={period}
          bounds={bounds}
          isLoading={isActivityLoading}
          hasActivityIn={hasActivityIn}
          onJump={setPeriod}
          today={today}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Revenue" scope={period.label} value={periodPnl.data?.revenue_pkr ?? 0} sub={`Sales booked in ${period.label}`} href={`/insights/revenue${periodSearch}`} tone="good" />
          <MetricCard title="Total revenue" scope="all-time" value={totalRevenue} sub="All paid sales, all time" href={`/insights/total-revenue${periodSearch}`} />
          <MetricCard title="Money out" scope={period.label} value={periodPnl.data?.operating_expense_pkr ?? 0} sub="Operating expenses, marketing, refunds, delivery" href={`/insights/money-out${periodSearch}`} tone="bad" />
          <MetricCard title="Profit" scope={period.label} value={periodPnl.data?.kept_pkr ?? 0} sub={`What you kept in ${period.label}, after costs & the investor split`} href={`/insights/profit${periodSearch}`} tone="good" highlight />
        </div>

        {/* This month vs last month — calendar-month P&L, side by side (pnl_summary_between). */}
        <h2 className="mb-3 mt-8 [font-family:var(--font-heading)] uppercase tracking-wide">This month vs last month</h2>
        <MonthCompare
          thisLabel={mw.thisLabel}
          lastLabel={mw.lastLabel}
          thisPnl={thisMonthPnl.data}
          lastPnl={lastMonthPnl.data}
          loading={thisMonthPnl.isLoading || lastMonthPnl.isLoading}
        />

        {/* Full breakdown for the selected period — same picker as the headline above. */}
        <h2 className="mb-3 mt-8 [font-family:var(--font-heading)] uppercase tracking-wide">Full breakdown for <span className="font-normal normal-case tracking-normal text-muted-foreground">{period.label}</span></h2>
        {/* Every tile drills down, same as the headline row. Investors' share has no /insights page
            (it isn't a pnl_summary line the waterfall explains) — it goes to the Investors page,
            which breaks the same figure down per investor and per deal. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="Revenue" scope={period.label} value={periodPnl.data?.revenue_pkr ?? 0} sub="Sales booked in this period" href={`/insights/revenue${periodSearch}`} tone="good" />
          <MetricCard title="Product costs" scope={period.label} value={periodPnl.data?.cogs_pkr ?? 0} sub="COGS on what sold" href={`/insights/product-costs${periodSearch}`} tone="bad" />
          <MetricCard title="Operating expenses" scope={period.label} value={periodPnl.data?.operating_expense_pkr ?? 0} sub="Opex, marketing, refunds, delivery, corrections" href={`/insights/operating-expenses${periodSearch}`} tone="bad" />
          <MetricCard title="Investors' share" scope={period.label} value={periodPnl.data?.investor_share_pkr ?? 0} sub="Investors' cut of the margin" href="/investors" tone="bad" />
          <MetricCard title="Profit" scope={period.label} value={periodPnl.data?.kept_pkr ?? 0} sub="What you kept in this period" href={`/insights/profit${periodSearch}`} tone="good" highlight />
        </div>

        {/* Where the money goes — split total money out into product costs (COGS) vs operating
            expenses. Lifetime (all-time), straight from pnl_summary — reconciles to revenue. */}
        <h2 className="mb-3 mt-8 [font-family:var(--font-heading)] uppercase tracking-wide">Where your money goes</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard title="Product costs" scope="all-time" value={pnlQ.data?.cogs_pkr ?? 0} sub="Cost of the goods you've actually sold (COGS)" href={`/insights/product-costs${periodSearch}`} tone="bad" />
          <MetricCard title="Operational expenses" scope="all-time" value={pnlQ.data?.operating_expense_pkr ?? 0} sub="Rent, salaries, subscriptions, marketing, refunds, customer delivery & at-fault corrections" href={`/insights/operating-expenses${periodSearch}`} tone="bad" />
        </div>
        {pnlQ.data && (
          <p className="mt-2 text-xs text-muted-foreground">
            All time: total revenue <span className="font-medium text-foreground tabular-nums">{formatPKR(pnlQ.data.revenue_pkr)}</span> = product costs {formatPKR(pnlQ.data.cogs_pkr)} + operating expenses {formatPKR(pnlQ.data.operating_expense_pkr)} + investors&apos; share {formatPKR(pnlQ.data.investor_share_pkr)} + profit {formatPKR(pnlQ.data.kept_pkr)}.
          </p>
        )}

        {/* Owed & owing — every figure straight from its verified view (card = detail) */}
        <h2 className="mb-3 mt-8 [font-family:var(--font-heading)] uppercase tracking-wide">Owed &amp; owing <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground">as of now</span></h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="Customers owe you" value={owed} sub={`${owedRows.length} unpaid invoice${owedRows.length === 1 ? "" : "s"}`} href="/invoices" />
          <MetricCard title="You owe vendors" value={payables} sub="Unpaid POs: items + local shipping" href="/purchasing" tone="bad" />
          <MetricCard title="Owed to couriers" value={deliveryOwed} sub="Customer delivery, unpaid bills" href="/finance?tab=delivery" tone="bad" />
          <MetricCard title="Owed to investors" value={investorOwed} sub="Accrued − paid out (see Investors)" href="/investors" tone="bad" />
          <MetricCard title="Parked with vendors" value={advancesParked} sub="Prepaid logistics credit, not a cost" href="/finance?tab=advances" tone="parked" />
        </div>

        {/* Inventory position */}
        <h2 className="mb-3 mt-8 [font-family:var(--font-heading)] uppercase tracking-wide">Inventory position <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground">as of now</span></h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard title="Stock on hand (value)" value={stockValue} sub="On-hand × landed cost, all products" href="/products" icon={Boxes} />
          <MetricCard title="Low stock" value={lowCount} sub="At or below the reorder threshold" href="/products" count tone={lowCount > 0 ? "bad" : "good"} />
          <MetricCard title="Out of stock" value={outCount} sub="Nothing on hand" href="/products" count tone={outCount > 0 ? "bad" : "good"} />
        </div>

        <div className="mt-6 rounded-md border border-border bg-card p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="[font-family:var(--font-heading)] uppercase tracking-wide">Sales over time</h2>
            <span className="text-xs text-muted-foreground">Each point = one {chartGrain} of paid sales</span>
          </div>
          {/* This chart is CASH (analytics_daily = payments received), while the Revenue card above
              is accrual (pnl_summary_between reads sale/fulfilment dates and no payments at all).
              They can legitimately differ, so say which one this is rather than leave it a mystery. */}
          <p className="mb-4 text-sm text-muted-foreground">Money actually received. Hover any point to see that {chartGrain}'s total.</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ left: -8, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="anaRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#cc0000" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#cc0000" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#999" minTickGap={24} />
                <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11 }} stroke="#999" width={56} />
                <Tooltip
                  formatter={(v: number) => [formatPKR(v), "Sales"]}
                  contentStyle={{ borderRadius: 6, border: "1px solid #e5e5e5", fontSize: 12 }}
                  labelFormatter={(l) => `On ${l}`}
                />
                <Area type="monotone" dataKey="revenue" stroke="#cc0000" strokeWidth={2} fill="url(#anaRev)" name="Sales" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="rounded-md border border-border bg-card p-5 lg:col-span-3">
            <h2 className="mb-1 [font-family:var(--font-heading)] uppercase tracking-wide">What's selling</h2>
            <p className="mb-4 text-sm text-muted-foreground">Top categories by sales in {period.label}. Click to see the sub-categories.</p>
            {rollup.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period.</p>
            ) : (
              <ul className="space-y-3">
                {rollup.items.map((c, i) => {
                  const open = expanded === c.id;
                  return (
                    <li key={c.id}>
                      <button type="button" className="w-full text-left" onClick={() => setExpanded(open ? null : c.id)}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span className="grid size-5 place-items-center rounded-full bg-black text-[10px] font-bold text-white tabular-nums">{i + 1}</span>
                            <span className="font-medium">{c.name}</span>
                            {c.leaves.length > 1 && (open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />)}
                          </span>
                          <span className="text-sm tabular-nums">
                            <span className="font-medium">{formatPKR(c.value)}</span>
                            <span className="ml-2 text-muted-foreground">{c.share}%</span>
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-[#cc0000] transition-all" style={{ width: c.share + "%" }} />
                        </div>
                      </button>
                      {open && (
                        <ul className="ml-7 mt-2 space-y-1.5">
                          {c.leaves.map((leaf) => (
                            <li key={leaf.name} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{leaf.name}</span>
                              <span className="tabular-nums">{formatPKR(leaf.value)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-border bg-card p-5 lg:col-span-2">
            <h2 className="mb-1 [font-family:var(--font-heading)] uppercase tracking-wide">Things to look at</h2>
            <p className="mb-4 text-sm text-muted-foreground">A quick heads-up on what needs your attention.</p>
            {callouts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">All clear. Nothing urgent.</p>
            ) : (
              <ul className="space-y-2">
                {callouts.map((cb, i) => {
                  const Icon = cb.icon;
                  const bg =
                    cb.tone === "warn"
                      ? "bg-[#cc0000]/10 text-[#cc0000] border-[#cc0000]/30"
                      : cb.tone === "good"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-secondary text-foreground border-border";
                  const inner = (
                    <span className={cn("flex items-start gap-2.5 rounded-md border p-3 transition-colors hover:opacity-90", bg)}>
                      <Icon className="mt-0.5 size-4 shrink-0" />
                      <span className="text-sm leading-snug">{cb.text}</span>
                    </span>
                  );
                  return <li key={i}>{cb.href ? <Link to={cb.href}>{inner}</Link> : inner}</li>;
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Activity — recent orders, fulfilments awaiting stock, procurement pipeline */}
        <h2 className="mb-3 mt-8 [font-family:var(--font-heading)] uppercase tracking-wide">Activity</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ActivityCard title="Recent orders" href="/orders" cta="All">
            <ul className="space-y-2">
              {recentOrders.map((o) => (
                // Rows are plain text, not links: the whole card already navigates to /orders, and
                // an <a> inside an <a> is invalid and would swallow the card's own click target.
                <li key={o.id} className="flex items-center justify-between text-sm">
                  <span className="truncate"><span className="font-mono text-xs">{o.order_no}</span> · {o.customers?.name ?? "—"} <span className="text-muted-foreground">({STAGE_LABEL[o.stage]})</span></span>
                  <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">{formatPKR(o.total_pkr)}</span>
                </li>
              ))}
              {recentOrders.length === 0 && <li className="text-sm text-muted-foreground">No orders yet.</li>}
            </ul>
          </ActivityCard>

          <ActivityCard title="Awaiting stock" href="/orders" cta="Orders" icon={KanbanSquare}>
            <p className="[font-family:var(--font-heading)] text-3xl font-bold tabular-nums">{pendingFulfil.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">order{pendingFulfil.length === 1 ? "" : "s"} with lines not yet delivered, waiting on sourced stock.</p>
          </ActivityCard>

          <ActivityCard title="Procurement pipeline" href="/purchasing" cta="Open">
            {pipelineCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing planned.</p>
            ) : (
              <ul className="space-y-1.5">
                {pipelineCounts.map((c) => (
                  <li key={c.status} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{STATUS_LABEL[c.status]}</span>
                    <span className="font-medium tabular-nums">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </ActivityCard>
        </div>

        <VendorAdvancesPanel />
      </div>
  );
}

// An Activity tile. The WHOLE card is the link — the header arrow is an affordance, not the target,
// so it must stay a <span> (a nested <a> is invalid and would carve a hole in the card's hit area).
// Anything rendered inside must likewise be plain text, never its own link.
function ActivityCard({ title, href, cta, icon: Icon, children }: {
  title: string;
  href: string;
  cta: string;
  icon?: typeof Boxes;
  children: ReactNode;
}) {
  return (
    <Link to={href} className="block h-full">
      <div className="h-full rounded-md border border-border bg-card p-5 transition-colors hover:border-foreground/30">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm [font-family:var(--font-heading)] uppercase tracking-wide">
            {Icon && <Icon className="size-4 shrink-0 text-[#cc0000]" />}
            {title}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{cta} <ArrowUpRight className="size-3" /></span>
        </div>
        {children}
      </div>
    </Link>
  );
}

// A tiny timeframe tag on a metric card. `live` = follows the top date filter (accent);
// otherwise it's a fixed scope (all-time / now) shown muted.
function ScopeBadge({ label, live }: { label: string; live?: boolean }) {
  return (
    <span className={cn(
      "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
      live ? "bg-[#cc0000]/10 text-[#cc0000]" : "bg-secondary text-muted-foreground",
    )}>{label}</span>
  );
}


// Command-center metric — a figure read straight from a verified view, optionally linking to its
// detail page. `count` shows a raw number (not PKR); `parked` uses a non-red tone (outside the P&L).
function MetricCard({ title, value, sub, href, tone, count, icon, highlight, scope, scopeLive }: {
  title: string;
  value: number;
  sub: string;
  href?: string;
  tone?: "good" | "bad" | "parked";
  count?: boolean;
  icon?: typeof Boxes;
  highlight?: boolean;
  scope?: string;
  scopeLive?: boolean;
}) {
  const Icon = icon;
  const valueColor = tone === "bad" ? "text-[#cc0000]" : tone === "parked" ? "text-indigo-700" : "text-foreground";
  const inner = (
    <div className={cn("h-full rounded-md border bg-card p-5", highlight ? "border-[#cc0000]" : "border-border", href && "transition-colors hover:border-foreground/30")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">{title}</p>
          {scope && <ScopeBadge label={scope} live={scopeLive} />}
        </div>
        {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" /> : href ? <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      </div>
      <p className={cn("mt-2 [font-family:var(--font-heading)] text-2xl font-bold tabular-nums", valueColor)}>{count ? value : formatPKR(value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
  return href ? <Link to={href} className="block h-full">{inner}</Link> : inner;
}

// This month vs last month — calendar-month P&L side by side, each figure from
// pnl_summary_between. Costs are "good when down"; revenue/profit "good when up".
const EMPTY_PNL: PnlBetween = {
  revenue_pkr: 0, cogs_pkr: 0, gross_margin_pkr: 0, house_margin_pkr: 0, investor_share_pkr: 0,
  marketing_pkr: 0, corrections_pkr: 0, refunds_pkr: 0, delivery_pkr: 0, operating_expense_pkr: 0, kept_pkr: 0,
};
function MonthCompare({ thisLabel, lastLabel, thisPnl, lastPnl, loading }: {
  thisLabel: string;
  lastLabel: string;
  thisPnl?: PnlBetween;
  lastPnl?: PnlBetween;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-64 w-full rounded-md" />;
  const cur = thisPnl ?? EMPTY_PNL;
  const prev = lastPnl ?? EMPTY_PNL;
  const rows: { label: string; get: (p: PnlBetween) => number; goodWhenUp: boolean; strong?: boolean }[] = [
    { label: "Revenue", get: (p) => p.revenue_pkr, goodWhenUp: true },
    { label: "Product costs (COGS)", get: (p) => p.cogs_pkr, goodWhenUp: false },
    { label: "Operating expenses", get: (p) => p.operating_expense_pkr, goodWhenUp: false },
    { label: "Investors' share", get: (p) => p.investor_share_pkr, goodWhenUp: false },
    { label: "Profit: what you kept", get: (p) => p.kept_pkr, goodWhenUp: true, strong: true },
  ];
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="p-3 text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">Metric</th>
            <th className="p-3 text-right text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">{thisLabel}</th>
            <th className="p-3 text-right text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">{lastLabel}</th>
            <th className="p-3 text-right text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = r.get(cur);
            const p = r.get(prev);
            const same = c === p;
            const favorable = r.goodWhenUp ? c >= p : c <= p;
            const chg = p === 0
              ? (c === 0 ? "—" : "new")
              : `${c - p >= 0 ? "+" : "−"}${Math.abs(Math.round(((c - p) / Math.abs(p)) * 100))}%`;
            const chgColor = same ? "text-muted-foreground" : favorable ? "text-emerald-600" : "text-[#cc0000]";
            return (
              <tr key={r.label} className={cn("border-b border-border last:border-0", r.strong && "bg-secondary/40")}>
                <td className={cn("p-3", r.strong && "font-semibold")}>{r.label}</td>
                <td className={cn("p-3 text-right tabular-nums", r.strong && "font-semibold")}>{formatPKR(c)}</td>
                <td className="p-3 text-right tabular-nums text-muted-foreground">{formatPKR(p)}</td>
                <td className={cn("p-3 text-right tabular-nums", chgColor)}>{chg}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Brand-new shop — guide the first three actions instead of showing a wall of zeros.
function GetStarted() {
  const steps = [
    { n: 1, icon: Package, title: "Add your products", desc: "Build your catalogue, one product at a time.", to: "/products?new=1", cta: "New product" },
    { n: 2, icon: ShoppingBag, title: "Buy & receive stock", desc: "Create a purchase order, then receive it to put stock on hand at its real cost.", to: "/purchasing?new=1", cta: "New purchase order" },
    { n: 3, icon: KanbanSquare, title: "Take an order", desc: "Record a customer order and deliver it. Your numbers start here.", to: "/orders?new=1", cta: "New order" },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-md border border-border bg-card p-8 text-center">
        <h2 className="[font-family:var(--font-heading)] text-2xl font-bold tracking-tight">Let&apos;s set up your shop</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">No data yet. These three steps get your dashboard filling with real numbers.</p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="flex flex-col rounded-md border border-border bg-card p-5">
            <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-[#cc0000]/10 text-[#cc0000]"><s.icon className="size-4" /></div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Step {s.n}</p>
            <h3 className="mt-0.5 font-medium">{s.title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{s.desc}</p>
            <Link to={s.to} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#cc0000] hover:underline">{s.cta} <ArrowUpRight className="size-3.5" /></Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// First-load placeholder for the top of the dashboard.
function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="mb-3 h-5 w-40" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-md" />)}
        </div>
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
        </div>
      </div>
      <Skeleton className="h-72 w-full rounded-md" />
    </div>
  );
}
