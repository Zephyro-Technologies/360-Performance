// Investor data layer — investors + deals (catalogue ownership). The owed subledger +
// payouts live alongside (Phase 4c). split_pct is stored as a FRACTION (0.5 = 50%); the UI
// works in whole percent. Server-authoritative; invalidate-on-success refetch.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export interface Investor {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
}

export function useInvestors() {
  return useQuery({
    queryKey: ["investors"],
    queryFn: async (): Promise<Investor[]> => {
      const { data, error } = await supabase.from("investors").select("id, name, contact, phone, notes, active").order("name");
      if (error) throw new Error(friendlyError(error));
      return data ?? [];
    },
  });
}

export interface InvestorDeal {
  id: string;
  investor_id: string;
  split_pct: number; // fraction (0.5 = 50%)
  label: string | null;
  active: boolean;
  investors: { name: string } | null;
}

// Active deals, for the product editor's owner picker (each shows investor + split).
export function useInvestorDeals() {
  return useQuery({
    queryKey: ["investor-deals"],
    queryFn: async (): Promise<InvestorDeal[]> => {
      const { data, error } = await supabase
        .from("investor_deals")
        .select("id, investor_id, split_pct, label, active, investors(name)")
        .eq("active", true)
        .order("created_at");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((d) => ({ ...d, split_pct: Number(d.split_pct) })) as unknown as InvestorDeal[];
    },
  });
}

export const dealLabel = (d: InvestorDeal) => `${d.investors?.name ?? "Investor"} · ${Math.round(d.split_pct * 100)}%${d.label ? ` (${d.label})` : ""}`;

// Per-product breakdown for investor-owned products: cost, profit, and the investor vs house
// split — plus what's still in stock (their capital not yet returned).
export interface InvestorProductPnl {
  product_id: string;
  name: string;
  sku: string;
  investor_deal_id: string;
  investor_id: string;
  investor_name: string;
  split_pct: number;
  qty_sold: number;
  revenue_pkr: number;
  capital_returned_pkr: number;
  profit_pkr: number;
  investor_share_pkr: number;
  house_share_pkr: number;
  cost_per_unit_pkr: number | null;
  sold_price_per_unit_pkr: number | null;
  profit_per_unit_pkr: number | null;
  on_hand_qty: number;
  on_hand_value_pkr: number;
}
export function useInvestorProductPnl() {
  return useQuery({
    queryKey: ["investor-product-pnl"],
    queryFn: async (): Promise<InvestorProductPnl[]> => {
      const { data, error } = await supabase
        .from("investor_product_pnl")
        .select("*")
        .order("investor_name")
        .order("name");
      if (error) throw new Error(friendlyError(error));
      const n = (v: unknown) => Number(v ?? 0);
      const nn = (v: unknown) => (v == null ? null : Number(v));
      return (data ?? []).map((r) => ({
        product_id: r.product_id as string,
        name: r.name as string,
        sku: r.sku as string,
        investor_deal_id: r.investor_deal_id as string,
        investor_id: r.investor_id as string,
        investor_name: r.investor_name as string,
        split_pct: n(r.split_pct),
        qty_sold: n(r.qty_sold),
        revenue_pkr: n(r.revenue_pkr),
        capital_returned_pkr: n(r.capital_returned_pkr),
        profit_pkr: n(r.profit_pkr),
        investor_share_pkr: n(r.investor_share_pkr),
        house_share_pkr: n(r.house_share_pkr),
        cost_per_unit_pkr: nn(r.cost_per_unit_pkr),
        sold_price_per_unit_pkr: nn(r.sold_price_per_unit_pkr),
        profit_per_unit_pkr: nn(r.profit_per_unit_pkr),
        on_hand_qty: n(r.on_hand_qty),
        on_hand_value_pkr: n(r.on_hand_value_pkr),
      }));
    },
  });
}

const investorSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  contact: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
});
export type InvestorInput = z.infer<typeof investorSchema>;

export function useCreateInvestor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InvestorInput) => {
      const parsed = investorSchema.parse(input);
      const { error } = await supabase.from("investors").insert(parsed);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investors"] }),
  });
}

const dealSchema = z.object({
  investor_id: z.string().uuid("Choose an investor"),
  split_pct: z.number().min(0, "0–100%").max(1, "0–100%"), // fraction
  label: z.string().trim().nullable(),
});
export type DealInput = z.infer<typeof dealSchema>;

export function useCreateInvestorDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DealInput) => {
      const parsed = dealSchema.parse(input);
      const { error } = await supabase.from("investor_deals").insert(parsed);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investor-deals"] }),
  });
}

// ---- settlement subledger (owed + payouts) + the re-based P&L ----------------

export interface InvestorOwed {
  investor_id: string;
  name: string;
  active: boolean;
  accrued_pkr: number;
  paid_out_pkr: number;
  owed_pkr: number;
}
export function useInvestorOwed() {
  return useQuery({
    queryKey: ["investor-owed"],
    queryFn: async (): Promise<InvestorOwed[]> => {
      const { data, error } = await supabase.from("investor_owed").select("investor_id, name, active, accrued_pkr, paid_out_pkr, owed_pkr").order("name");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((r) => ({
        investor_id: r.investor_id as string,
        name: r.name as string,
        active: !!r.active,
        accrued_pkr: Number(r.accrued_pkr ?? 0),
        paid_out_pkr: Number(r.paid_out_pkr ?? 0),
        owed_pkr: Number(r.owed_pkr ?? 0),
      }));
    },
  });
}

export interface InvestorPayout {
  id: string;
  investor_id: string;
  kind: "payout" | "reversal";
  amount_pkr: number;
  paid_on: string;
  note: string | null;
  reverses_id: string | null;
  created_at: string;
  investors: { name: string } | null;
}
export function useInvestorPayouts() {
  return useQuery({
    queryKey: ["investor-payouts"],
    queryFn: async (): Promise<InvestorPayout[]> => {
      const { data, error } = await supabase
        .from("investor_payouts")
        .select("id, investor_id, kind, amount_pkr, paid_on, note, reverses_id, created_at, investors(name)")
        .order("paid_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((r) => ({ ...r, amount_pkr: Number(r.amount_pkr) })) as unknown as InvestorPayout[];
    },
  });
}

const payoutSchema = z.object({
  investor_id: z.string().uuid("Choose an investor"),
  amount_pkr: z.number({ invalid_type_error: "Enter an amount" }).finite().positive("Amount must be more than 0"),
  paid_on: z.string().min(1).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type PayoutInput = z.infer<typeof payoutSchema>;

function invalidateSettlement(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["investor-owed"] });
  qc.invalidateQueries({ queryKey: ["investor-payouts"] });
}

export function useRecordPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PayoutInput) => {
      const parsed = payoutSchema.parse(input);
      const { error } = await supabase.from("investor_payouts").insert({
        investor_id: parsed.investor_id,
        kind: "payout",
        amount_pkr: parsed.amount_pkr,
        paid_on: parsed.paid_on || undefined,
        note: parsed.note?.trim() || null,
      });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidateSettlement(qc),
  });
}

// Admin correction — posts the opposite-kind reversal row (the DB guard enforces equal
// amount, same investor, target not already reversed).
export function useReversePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: InvestorPayout) => {
      const { error } = await supabase.from("investor_payouts").insert({
        investor_id: p.investor_id,
        kind: "reversal",
        amount_pkr: p.amount_pkr,
        reverses_id: p.id,
        note: `Reversal of payout (${p.paid_on})`,
      });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidateSettlement(qc),
  });
}

export interface PnlSummary {
  revenue_pkr: number;
  cogs_pkr: number;
  gross_margin_pkr: number;
  house_margin_pkr: number;
  investor_share_pkr: number;
  operating_expense_pkr: number;
  marketing_pkr: number;
  corrections_pkr: number;
  refunds_pkr: number;
  delivery_pkr: number;
  kept_pkr: number;
}
export function usePnlSummary() {
  return useQuery({
    queryKey: ["pnl-summary"],
    queryFn: async (): Promise<PnlSummary> => {
      const { data, error } = await supabase
        .from("pnl_summary")
        .select("revenue_pkr, cogs_pkr, gross_margin_pkr, house_margin_pkr, investor_share_pkr, operating_expense_pkr, marketing_pkr, corrections_pkr, refunds_pkr, delivery_pkr, kept_pkr")
        .single();
      if (error) throw new Error(friendlyError(error));
      const n = (v: unknown) => Number(v ?? 0);
      return {
        revenue_pkr: n(data?.revenue_pkr), cogs_pkr: n(data?.cogs_pkr), gross_margin_pkr: n(data?.gross_margin_pkr),
        house_margin_pkr: n(data?.house_margin_pkr), investor_share_pkr: n(data?.investor_share_pkr),
        operating_expense_pkr: n(data?.operating_expense_pkr), marketing_pkr: n(data?.marketing_pkr),
        corrections_pkr: n(data?.corrections_pkr), refunds_pkr: n(data?.refunds_pkr), delivery_pkr: n(data?.delivery_pkr), kept_pkr: n(data?.kept_pkr),
      };
    },
  });
}
