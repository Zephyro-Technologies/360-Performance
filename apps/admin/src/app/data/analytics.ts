// Analytics data layer — reads the DB views (no parallel computation):
// money from analytics_daily (netted paid), receivables from invoice_balances,
// "what's selling" from category_sales (parent rollup), top customer from payments.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

// ---- the business day -------------------------------------------------------------------------
// 360 trades in Islamabad, so "today" is TODAY IN PAKISTAN (PKT, UTC+5) — never the viewer's clock.
// It has to be: the DB stores plain `date` columns (payments.paid_on, invoices.issue_date, ...)
// written against the business day, so a laptop in New York at 20:00 must still report the same
// reporting period as the office, where it is already tomorrow. Reading the viewer's local date
// would shift every window by a day for anyone travelling or working remotely, silently moving
// money between months at the boundary.
//
// Resolved via Intl rather than a hardcoded +5 so that if Pakistan ever reinstates DST (it ran
// briefly in 2008–09) this follows the tzdata instead of quietly going an hour wrong.
const PK_TIME_ZONE = "Asia/Karachi";
const PK_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: PK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// All downstream date math is UTC-based (Date.UTC + the UTC getters), so the business day is
// modelled as a UTC-midnight Date. Keep it that way: a local-midnight Date rolls back a day when
// read with the UTC getters in any negative-offset zone.
export const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export function businessTodayISO(now: Date = new Date()): string {
  const p = Object.fromEntries(PK_DATE_PARTS.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** The current business day (Pakistan), as a UTC-midnight Date for the UTC date math. */
export function businessToday(): Date {
  return new Date(businessTodayISO() + "T00:00:00Z");
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthWindows {
  thisStart: string;
  thisEnd: string; // month-to-date (1st → today)
  thisLabel: string;
  lastStart: string;
  lastEnd: string; // full previous calendar month
  lastLabel: string;
}

// The current calendar month (month-to-date) and the full previous calendar month —
// for "profit this month" and the month-over-month comparison. UTC-anchored to the
// local calendar day, matching rangeWindows (no timezone drift).
export function monthWindows(): MonthWindows {
  const today = businessToday();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const thisStart = new Date(Date.UTC(y, m, 1));
  const lastStart = new Date(Date.UTC(y, m - 1, 1));
  const lastEnd = new Date(Date.UTC(y, m, 0)); // day 0 of this month = last day of previous month
  const thisIsComplete = iso(today) === iso(new Date(Date.UTC(y, m + 1, 0)));
  return {
    thisStart: iso(thisStart),
    thisEnd: iso(today),
    // "so far" matters: thisEnd is TODAY, not the month's last day, so this window is usually
    // shorter than lastLabel's. Without the suffix the month-vs-month table compares (say) 17 days
    // against 30 under two labels that look equally complete.
    thisLabel: `${MONTH_NAMES[thisStart.getUTCMonth()]} ${thisStart.getUTCFullYear()}${thisIsComplete ? "" : " so far"}`,
    lastStart: iso(lastStart),
    lastEnd: iso(lastEnd),
    lastLabel: `${MONTH_NAMES[lastStart.getUTCMonth()]} ${lastStart.getUTCFullYear()}`,
  };
}

// One row per day on which ANY financial activity happened — see the activity_days migration
// (20260622090095) for why it unions every date column the analytics surfaces read. It is a
// SUPERSET of what any card can draw from, so a window with no rows here is guaranteed to render
// zeros everywhere; that's what lets the picker flag an empty period honestly.
export function useActivityDays() {
  return useQuery({
    queryKey: ["activity_days"],
    // The view is ten unindexed branch scans and it's read on every Analytics mount, but the answer
    // only moves when a financial row is written. Session-lifetime cache.
    staleTime: Infinity,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("activity_days").select("day").order("day");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((r) => r.day as string).filter(Boolean);
    },
  });
}

// Date-scoped P&L — the lifetime pnl_summary formula filtered to [start, end], via the
// pnl_summary_between RPC. Same shape as pnl_summary; summing all months reconciles to it.
export interface PnlBetween {
  revenue_pkr: number;
  cogs_pkr: number;
  gross_margin_pkr: number;
  house_margin_pkr: number;
  investor_share_pkr: number;
  marketing_pkr: number;
  corrections_pkr: number;
  refunds_pkr: number;
  delivery_pkr: number;
  operating_expense_pkr: number;
  kept_pkr: number;
}
export function usePnlBetween(startISO: string, endISO: string) {
  return useQuery({
    queryKey: ["pnl_between", startISO, endISO],
    queryFn: async (): Promise<PnlBetween> => {
      const { data, error } = await supabase.rpc("pnl_summary_between", { p_start: startISO, p_end: endISO });
      if (error) throw new Error(friendlyError(error));
      const row = (Array.isArray(data) ? data[0] : data) ?? null;
      const n = (v: unknown) => Number(v ?? 0);
      return {
        revenue_pkr: n(row?.revenue_pkr),
        cogs_pkr: n(row?.cogs_pkr),
        gross_margin_pkr: n(row?.gross_margin_pkr),
        house_margin_pkr: n(row?.house_margin_pkr),
        investor_share_pkr: n(row?.investor_share_pkr),
        marketing_pkr: n(row?.marketing_pkr),
        corrections_pkr: n(row?.corrections_pkr),
        refunds_pkr: n(row?.refunds_pkr),
        delivery_pkr: n(row?.delivery_pkr),
        operating_expense_pkr: n(row?.operating_expense_pkr),
        kept_pkr: n(row?.kept_pkr),
      };
    },
  });
}

export interface DailyRow {
  day: string;
  revenue_pkr: number;
  expense_pkr: number;
}
export function useAnalyticsDaily() {
  return useQuery({
    queryKey: ["analytics_daily"],
    queryFn: async (): Promise<DailyRow[]> => {
      const { data, error } = await supabase
        .from("analytics_daily")
        .select("day, revenue_pkr, expense_pkr")
        .order("day");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as DailyRow[];
    },
  });
}

export interface BalanceRow {
  invoice_id: string;
  total_pkr: number;
  paid_pkr: number;
  balance_pkr: number;
  status: string;
}
export function useInvoiceBalances() {
  return useQuery({
    queryKey: ["invoice_balances"],
    queryFn: async (): Promise<BalanceRow[]> => {
      const { data, error } = await supabase
        .from("invoice_balances")
        .select("invoice_id, total_pkr, paid_pkr, balance_pkr, status");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as BalanceRow[];
    },
  });
}

export interface CategorySaleRow {
  rollup_id: string | null;
  rollup_name: string;
  category_id: string | null;
  category_name: string;
  revenue_pkr: number;
}
export function useCategorySales(startISO: string, endISO: string) {
  return useQuery({
    queryKey: ["category_sales", startISO, endISO],
    queryFn: async (): Promise<CategorySaleRow[]> => {
      const { data, error } = await supabase
        .from("category_sales")
        .select("rollup_id, rollup_name, category_id, category_name, revenue_pkr")
        .gte("issue_date", startISO)
        .lte("issue_date", endISO);
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as CategorySaleRow[];
    },
  });
}

export interface TopCustomer {
  name: string;
  net: number;
}
// Top customer by NET paid (payments - reversals) within the window.
export function useTopCustomer(startISO: string, endISO: string) {
  return useQuery({
    queryKey: ["top_customer", startISO, endISO],
    queryFn: async (): Promise<TopCustomer | null> => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount_pkr, kind, invoices!inner(customer_id, customers(name))")
        .gte("paid_on", startISO)
        .lte("paid_on", endISO);
      if (error) throw new Error(friendlyError(error));
      const byCust = new Map<string, TopCustomer>();
      for (const p of (data ?? []) as Array<{
        amount_pkr: number;
        kind: string;
        invoices: { customer_id: string; customers: { name: string } | null } | null;
      }>) {
        const cid = p.invoices?.customer_id;
        if (!cid) continue;
        const signed = p.kind === "payment" ? Number(p.amount_pkr) : -Number(p.amount_pkr);
        const cur = byCust.get(cid) ?? { name: p.invoices?.customers?.name ?? "Unknown", net: 0 };
        cur.net += signed;
        byCust.set(cid, cur);
      }
      const top = [...byCust.values()].filter((c) => c.net > 0).sort((a, b) => b.net - a.net)[0];
      return top ?? null;
    },
  });
}

// Per-product sold economics (revenue / COGS / profit) — for the metric-detail drill-downs.
export interface ProductSalesPnl {
  product_id: string;
  name: string;
  sku: string;
  owner_kind: "house" | "investor";
  qty_sold: number;
  revenue_pkr: number;
  cogs_pkr: number;
  margin_pkr: number;
}
export function useProductSalesPnl() {
  return useQuery({
    queryKey: ["product-sales-pnl"],
    queryFn: async (): Promise<ProductSalesPnl[]> => {
      const { data, error } = await supabase
        .from("product_sales_pnl")
        .select("product_id, name, sku, owner_kind, qty_sold, revenue_pkr, cogs_pkr, margin_pkr")
        .order("cogs_pkr", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      const n = (v: unknown) => Number(v ?? 0);
      return (data ?? []).map((r) => ({
        product_id: r.product_id as string,
        name: r.name as string,
        sku: r.sku as string,
        owner_kind: r.owner_kind as "house" | "investor",
        qty_sold: n(r.qty_sold),
        revenue_pkr: n(r.revenue_pkr),
        cogs_pkr: n(r.cogs_pkr),
        margin_pkr: n(r.margin_pkr),
      }));
    },
  });
}
