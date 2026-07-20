// Metric detail — a "how this number was built" breakdown for each headline dashboard tile.
// One page keyed by :metric. Every figure is read from the same verified views the tiles use
// (pnl_summary, analytics_daily, product_sales_pnl) plus the ledgers, so the breakdown always
// reconciles to the tile. Range-aware metrics follow the top date filter.
import { type ReactNode } from "react";
import { Link, useParams, Navigate } from "react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { usePageHeader } from "../components/common/PageHeader";
import { usePeriodParams } from "../lib/usePeriodParams";
import { useAnalyticsDaily, useProductSalesPnl } from "../data/analytics";
import { usePnlSummary } from "../data/investors";
import { useExpenses, EXPENSE_LABEL } from "../data/expenses";
import { useRefunds, REFUND_CYCLE_LABEL } from "../data/refunds";
import { useDeliveries } from "../data/deliveries";
import { formatPKR, formatDate } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";

type MetricKey = "revenue" | "total-revenue" | "money-out" | "profit" | "product-costs" | "operating-expenses";
const META: Record<MetricKey, { title: string; rangeAware: boolean; blurb: string }> = {
  revenue: { title: "Revenue", rangeAware: true, blurb: "What customers actually paid you: payments received, minus any reversals." },
  "total-revenue": { title: "Total revenue", rangeAware: false, blurb: "Every payment customers have made, all time (net of reversals)." },
  "money-out": { title: "Money out", rangeAware: true, blurb: "Cash you spent: everyday running expenses plus refunds sent back. (Product cost is shown separately.)" },
  profit: { title: "Profit", rangeAware: false, blurb: "What you actually kept, after every cost and the investor split. All time." },
  "product-costs": { title: "Product costs", rangeAware: false, blurb: "The cost of the goods you've actually sold, each unit at what it cost you (COGS). All time." },
  "operating-expenses": { title: "Operational expenses", rangeAware: false, blurb: "Everything it takes to run the business, separate from the cost of the products themselves. All time." },
};

const inWin = (d: string, s: string, e: string) => d >= s && d <= e;
// A refund lands in the month its cycle points at (this month, or the 1st of next month).
function refundEffectiveDay(refunded_on: string, cycle: "current" | "next"): string {
  if (cycle !== "next") return refunded_on;
  const d = new Date(refunded_on + "T00:00:00Z");
  const nm = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return `${nm.getUTCFullYear()}-${String(nm.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function MetricDetail() {
  const { metric } = useParams();
  const { period, periodSearch } = usePeriodParams();

  const dailyQ = useAnalyticsDaily();
  const pnlQ = usePnlSummary();
  const expensesQ = useExpenses();
  const refundsQ = useRefunds();
  const deliveriesQ = useDeliveries();
  const productsQ = useProductSalesPnl();

  // Resolved before the guard below so the hook is called unconditionally (rules of hooks).
  const metricMeta = metric && metric in META ? META[metric as MetricKey] : null;
  usePageHeader(metricMeta?.title ?? "Insights", "How this number was built");

  if (!metric || !(metric in META)) return <Navigate to="/" replace />;
  const key = metric as MetricKey;
  const meta = META[key];
  const scope = meta.rangeAware ? period.label : "all time";

  const daily = dailyQ.data ?? [];
  const pnl = pnlQ.data;
  const expenses = expensesQ.data ?? [];
  const refunds = refundsQ.data ?? [];
  const deliveries = deliveriesQ.data ?? [];

  // ---- the headline value + the breakdown, per metric --------------------------------------
  const body = (() => {
    switch (key) {
      case "revenue":
      case "total-revenue": {
        const rows = meta.rangeAware ? daily.filter((d) => inWin(d.day, period.start, period.end)) : daily;
        const withRev = rows.filter((d) => Number(d.revenue_pkr) > 0).sort((a, b) => (a.day < b.day ? 1 : -1));
        const total = rows.reduce((s, d) => s + Number(d.revenue_pkr), 0);
        return {
          value: total,
          calc: [
            { label: "Customer payments received", amount: total, kind: "add" as const },
            { label: "Revenue", amount: total, kind: "total" as const },
          ],
          extra: (
            <LedgerCard title="Day by day" empty="No payments in this window." link={{ to: "/invoices", label: "All invoices" }}>
              {withRev.length > 0 && (
                <Table>
                  <TableHeader><HeadRow cols={["Day", "Revenue"]} /></TableHeader>
                  <TableBody>
                    {withRev.map((d) => (
                      <TableRow key={d.day}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(d.day)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPKR(Number(d.revenue_pkr))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </LedgerCard>
          ),
        };
      }
      case "money-out": {
        const exp = expenses.filter((e) => inWin(e.spent_on, period.start, period.end));
        const ref = refunds.filter((r) => inWin(refundEffectiveDay(r.refunded_on, r.deduction_cycle), period.start, period.end));
        const expTotal = exp.reduce((s, e) => s + e.amount_pkr, 0);
        const refTotal = ref.reduce((s, r) => s + r.amount_pkr, 0);
        return {
          value: expTotal + refTotal,
          calc: [
            { label: "Everyday running expenses", amount: expTotal, kind: "sub" as const, href: "/insights/operating-expenses" },
            { label: "Refunds sent back", amount: refTotal, kind: "sub" as const, href: "/finance?tab=refunds" },
            { label: "Money out", amount: expTotal + refTotal, kind: "total" as const },
          ],
          extra: (
            <>
              <LedgerCard title="Expenses in this window" empty="No expenses in this window." link={{ to: "/finance?tab=expenses", label: "Expenses" }}>
                {exp.length > 0 && (
                  <Table>
                    <TableHeader><HeadRow cols={["Date", "Category", "Note", "Amount"]} /></TableHeader>
                    <TableBody>
                      {exp.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(e.spent_on)}</TableCell>
                          <TableCell>{EXPENSE_LABEL[e.category]}</TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">{e.note}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPKR(e.amount_pkr)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </LedgerCard>
              <LedgerCard title="Refunds in this window" empty="No refunds in this window." link={{ to: "/finance?tab=refunds", label: "Refunds" }}>
                {ref.length > 0 && (
                  <Table>
                    <TableHeader><HeadRow cols={["Date", "Deducts", "Reason", "Amount"]} /></TableHeader>
                    <TableBody>
                      {ref.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.refunded_on)}</TableCell>
                          <TableCell>{REFUND_CYCLE_LABEL[r.deduction_cycle]}</TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">{r.reason}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPKR(r.amount_pkr)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </LedgerCard>
            </>
          ),
        };
      }
      case "profit": {
        if (!pnl) return { value: 0, calc: [], extra: null };
        const opexCore = pnl.operating_expense_pkr - pnl.marketing_pkr - pnl.corrections_pkr - pnl.refunds_pkr - pnl.delivery_pkr;
        return {
          value: pnl.kept_pkr,
          calc: [
            { label: "Revenue", amount: pnl.revenue_pkr, kind: "add" as const },
            { label: "Product costs (COGS)", amount: pnl.cogs_pkr, kind: "sub" as const, href: "/insights/product-costs" },
            { label: "Gross margin", amount: pnl.gross_margin_pkr, kind: "subtotal" as const },
            { label: "Investors' share", amount: pnl.investor_share_pkr, kind: "sub" as const, href: "/investors" },
            { label: "Your share (house)", amount: pnl.house_margin_pkr, kind: "subtotal" as const },
            { label: "Everyday expenses", amount: opexCore, kind: "sub" as const, href: "/finance?tab=expenses" },
            { label: "Marketing", amount: pnl.marketing_pkr, kind: "sub" as const, href: "/finance?tab=marketing" },
            { label: "At-fault corrections", amount: pnl.corrections_pkr, kind: "sub" as const },
            { label: "Refunds", amount: pnl.refunds_pkr, kind: "sub" as const, href: "/finance?tab=refunds" },
            { label: "Customer delivery", amount: pnl.delivery_pkr, kind: "sub" as const, href: "/finance?tab=delivery" },
            { label: "Profit: what you kept", amount: pnl.kept_pkr, kind: "total" as const },
          ],
          extra: null,
        };
      }
      case "product-costs": {
        const prods = (productsQ.data ?? []).filter((p) => p.cogs_pkr > 0);
        return {
          value: pnl?.cogs_pkr ?? 0,
          calc: [
            { label: "Revenue", amount: pnl?.revenue_pkr ?? 0, kind: "add" as const },
            { label: "Product costs (COGS)", amount: pnl?.cogs_pkr ?? 0, kind: "sub" as const },
            { label: "Gross margin left", amount: pnl?.gross_margin_pkr ?? 0, kind: "total" as const },
          ],
          extra: (
            <LedgerCard title="By product (units sold × their cost)" empty="Nothing sold yet." link={{ to: "/purchasing", label: "Purchasing" }}>
              {prods.length > 0 && (
                <Table>
                  <TableHeader><HeadRow cols={["Product", "Sold", "Cost", "Revenue", "Profit"]} /></TableHeader>
                  <TableBody>
                    {prods.map((p) => (
                      <TableRow key={p.product_id}>
                        <TableCell>
                          <p className="font-medium">{p.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.qty_sold}</TableCell>
                        <TableCell className="text-right tabular-nums text-[#cc0000]">{formatPKR(p.cogs_pkr)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(p.revenue_pkr)}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">{formatPKR(p.margin_pkr)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </LedgerCard>
          ),
        };
      }
      case "operating-expenses": {
        if (!pnl) return { value: 0, calc: [], extra: null };
        const opexCore = pnl.operating_expense_pkr - pnl.marketing_pkr - pnl.corrections_pkr - pnl.refunds_pkr - pnl.delivery_pkr;
        return {
          value: pnl.operating_expense_pkr,
          calc: [
            { label: "Everyday expenses (rent, salaries, subscriptions…)", amount: opexCore, kind: "sub" as const, href: "/finance?tab=expenses" },
            { label: "Marketing", amount: pnl.marketing_pkr, kind: "sub" as const, href: "/finance?tab=marketing" },
            { label: "At-fault corrections", amount: pnl.corrections_pkr, kind: "sub" as const },
            { label: "Refunds", amount: pnl.refunds_pkr, kind: "sub" as const, href: "/finance?tab=refunds" },
            { label: "Customer delivery", amount: pnl.delivery_pkr, kind: "sub" as const, href: "/finance?tab=delivery" },
            { label: "Total operating expenses", amount: pnl.operating_expense_pkr, kind: "total" as const },
          ],
          extra: (
            <LedgerCard title="Delivery bills" empty="No delivery costs logged." link={{ to: "/finance?tab=delivery", label: "Delivery" }}>
              {deliveries.length > 0 && (
                <Table>
                  <TableHeader><HeadRow cols={["Date", "Courier", "Status", "Amount"]} /></TableHeader>
                  <TableBody>
                    {deliveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(d.billed_on)}</TableCell>
                        <TableCell className="text-muted-foreground">{d.courier ?? "—"}</TableCell>
                        <TableCell>{d.paid_on ? "Paid" : "Owed"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPKR(d.amount_pkr)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </LedgerCard>
          ),
        };
      }
    }
  })();

  const loading = pnlQ.isLoading || dailyQ.isLoading;

  return (
    <div>
      {/* carry the period back, so returning to the dashboard doesn't silently reset the window */}
      <Link to={`/${periodSearch}`} className="inline-flex items-center gap-1.5 rounded-md bg-[#cc0000]/10 px-2.5 py-1 text-sm font-medium text-[#cc0000] transition-colors hover:bg-[#cc0000]/20">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <div className="mt-2 rounded-md border border-[#cc0000]/30 bg-[#cc0000]/5 p-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">{meta.title} · {scope}</p>
        <p className="mt-1 [font-family:var(--font-heading)] text-4xl font-bold tabular-nums">{formatPKR(body.value)}</p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{meta.blurb}</p>
      </div>

      {loading ? (
        <p className="py-10 text-center text-muted-foreground">Loading…</p>
      ) : (
        <div className={cn("mt-8 gap-8", body.extra ? "grid lg:grid-cols-2 lg:items-start" : "max-w-2xl")}>
          <div>
            <h2 className="mb-2 [font-family:var(--font-heading)] uppercase tracking-wide">How it's calculated</h2>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              {body.calc.map((r, i) => <CalcRow key={i} {...r} />)}
            </div>
          </div>
          {body.extra && <div className="space-y-6">{body.extra}</div>}
        </div>
      )}
    </div>
  );
}

function CalcRow({ label, amount, kind, href }: { label: string; amount: number; kind: "add" | "sub" | "subtotal" | "total"; href?: string }) {
  const isTotal = kind === "total";
  const isSubtotal = kind === "subtotal";
  const sign = kind === "sub" ? "−" : kind === "add" ? "+" : "";
  const amountColor = kind === "sub" ? "text-[#cc0000]" : isTotal ? "text-foreground" : "text-foreground";
  const inner = (
    <div className={cn(
      "flex items-center justify-between gap-3 px-4 py-3",
      isTotal ? "bg-secondary/50 font-bold" : isSubtotal ? "bg-secondary/20 font-medium" : "",
      href && "transition-colors hover:bg-secondary/30",
    )}>
      <span className={cn("flex items-center gap-1.5 text-sm", kind === "sub" && "pl-3 text-muted-foreground")}>
        {label}
        {href && <ArrowRight className="size-3.5 text-muted-foreground" />}
      </span>
      <span className={cn("tabular-nums", isTotal ? "text-lg" : "text-sm", amountColor)}>{sign}{formatPKR(amount)}</span>
    </div>
  );
  return (
    <div className="border-b border-border last:border-b-0">
      {href ? <Link to={href}>{inner}</Link> : inner}
    </div>
  );
}

function HeadRow({ cols }: { cols: string[] }) {
  return (
    <TableRow className="bg-black hover:bg-black">
      {cols.map((c, i) => <TableHead key={c} className={cn("text-white whitespace-nowrap", i > 0 && "text-right", i === 0 && "text-left")}>{c}</TableHead>)}
    </TableRow>
  );
}

function LedgerCard({ title, empty, link, children }: { title: string; empty: string; link: { to: string; label: string }; children: ReactNode }) {
  const hasContent = Boolean(children);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm [font-family:var(--font-heading)] uppercase tracking-wide">{title}</h3>
        <Link to={link.to} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">{link.label} <ArrowRight className="size-3" /></Link>
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        {hasContent ? children : <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>}
      </div>
    </div>
  );
}
