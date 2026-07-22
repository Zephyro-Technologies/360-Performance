// Marketing data layer — PR gifts (inventory given away; house stock only, drawn FIFO at
// landed cost) + cash marketing (sponsorship/paid-promo/discount). Both feed marketing_spend,
// which "What you kept" subtracts. PR-gift cost is marketing, never COGS.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type MarketingType = Database["public"]["Enums"]["marketing_type"];
export type PrStatus = Database["public"]["Enums"]["pr_status"];

export const MARKETING_TYPE_LABEL: Record<MarketingType, string> = {
  sponsorship: "Sponsorship", paid_promo: "Paid promo", discount: "Discount", other: "Other",
};
export const PR_STATUS_LABEL: Record<PrStatus, string> = {
  sent: "Sent", posted: "Posted", converted: "Converted", no_result: "No result",
};
export const PR_STATUS_FLOW: PrStatus[] = ["sent", "posted", "converted", "no_result"];

const num = (v: unknown) => Number(v ?? 0);

export interface MarketingSpend { cash_pkr: number; pr_gift_pkr: number; total_pkr: number }
export function useMarketingSpend() {
  return useQuery({
    queryKey: ["marketing-spend"],
    queryFn: async (): Promise<MarketingSpend> => {
      const { data, error } = await supabase.from("marketing_spend").select("cash_pkr, pr_gift_pkr, total_pkr").single();
      if (error) throw new Error(friendlyError(error));
      return { cash_pkr: num(data?.cash_pkr), pr_gift_pkr: num(data?.pr_gift_pkr), total_pkr: num(data?.total_pkr) };
    },
  });
}

// ---- PR gifts (the PR log) -------------------------------------------------
export interface PrGift {
  id: string;
  product_id: string;
  qty: number;
  recipient: string | null;
  platform: string | null;
  content_type: string | null;
  expected_reach: number | null;
  status: PrStatus;
  notes: string | null;
  occurred_on: string;
  products: { name: string; sku: string } | null;
  landed_cost_pkr: number; // derived from the linked pr_gift movements
}
type PrGiftRow = Omit<PrGift, "landed_cost_pkr"> & {
  stock_movements: { qty: number; batches: { landed_cost_pkr: number } | null }[] | null;
};

export function usePrGifts() {
  return useQuery({
    queryKey: ["pr-gifts"],
    queryFn: async (): Promise<PrGift[]> => {
      const { data, error } = await supabase
        .from("pr_gifts")
        .select(
          "id, product_id, qty, recipient, platform, content_type, expected_reach, status, notes, occurred_on, " +
            "products(name, sku), stock_movements(qty, batches(landed_cost_pkr))",
        )
        .order("occurred_on", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      const rows = (data ?? []) as unknown as PrGiftRow[];
      return rows.map(({ stock_movements, ...rest }) => ({
        ...rest,
        landed_cost_pkr: (stock_movements ?? []).reduce((s, m) => s + num(m.qty) * num(m.batches?.landed_cost_pkr), 0),
      }));
    },
  });
}

const giftSchema = z.object({
  product_id: z.string().uuid("Pick a product"),
  qty: z.number({ invalid_type_error: "Quantity must be a number" }).int().positive("At least 1"),
  recipient: z.string().trim().nullable(),
  platform: z.string().trim().nullable(),
  content_type: z.string().trim().nullable(),
  expected_reach: z.number().int().nonnegative().nullable(),
  status: z.enum(["sent", "posted", "converted", "no_result"]),
  notes: z.string().trim().nullable(),
  occurred_on: z.string().nullable(),
});
export type GiftInput = z.infer<typeof giftSchema>;

export function useGiftPr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GiftInput) => {
      const p = giftSchema.parse(input);
      const args = {
        p_product_id: p.product_id, p_qty: p.qty, p_recipient: p.recipient, p_platform: p.platform,
        p_content_type: p.content_type, p_expected_reach: p.expected_reach, p_status: p.status,
        p_notes: p.notes, p_occurred_on: p.occurred_on,
      } as unknown as Database["public"]["Functions"]["gift_pr"]["Args"];
      const { error } = await supabase.rpc("gift_pr", args);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pr-gifts"] });
      qc.invalidateQueries({ queryKey: ["marketing-spend"] });
      qc.invalidateQueries({ queryKey: ["pnl-summary"] });
      qc.invalidateQueries({ queryKey: ["products"] }); // on-hand changed
    },
  });
}

// Edit the PR log metadata (not qty/product — the stock-out is done).
export function useUpdatePrGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<PrGift, "recipient" | "platform" | "content_type" | "expected_reach" | "status" | "notes">>) => {
      const { error } = await supabase.from("pr_gifts").update(patch).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-gifts"] }),
  });
}

// ---- cash marketing (the cash ledger) -------------------------------------
export interface CashMarketing { id: string; kind: MarketingType; amount_pkr: number; recipient: string | null; note: string | null; spent_on: string; reverses_id: string | null }
export function useCashMarketing() {
  return useQuery({
    queryKey: ["cash-marketing"],
    queryFn: async (): Promise<CashMarketing[]> => {
      const { data, error } = await supabase.from("cash_marketing").select("id, kind, amount_pkr, recipient, note, spent_on, reverses_id").order("spent_on", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as CashMarketing[];
    },
  });
}

const cashSchema = z.object({
  kind: z.enum(["sponsorship", "paid_promo", "discount", "other"]),
  amount_pkr: z.number({ invalid_type_error: "Amount must be a number" }).positive("Greater than 0"),
  recipient: z.string().trim().nullable(),
  note: z.string().trim().nullable(),
  spent_on: z.string().nullable(),
});
export type CashInput = z.infer<typeof cashSchema>;

export function useAddCashMarketing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CashInput) => {
      const p = cashSchema.parse(input);
      const { error } = await supabase.from("cash_marketing").insert({
        kind: p.kind, amount_pkr: p.amount_pkr, recipient: p.recipient, note: p.note, ...(p.spent_on ? { spent_on: p.spent_on } : {}),
      });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-marketing"] });
      qc.invalidateQueries({ queryKey: ["marketing-spend"] });
      qc.invalidateQueries({ queryKey: ["pnl-summary"] });
    },
  });
}

// Cash marketing is an immutable ledger (no delete — see migration 090124). Correct a mistake
// with a signed reversal that nets it out of marketing spend / "What you kept".
export function useReverseCashMarketing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: CashMarketing) => {
      const { error } = await supabase.from("cash_marketing").insert({
        kind: r.kind, amount_pkr: -r.amount_pkr, recipient: r.recipient,
        note: `Reversal${r.note ? `: ${r.note}` : ""}`, spent_on: r.spent_on, reverses_id: r.id,
      });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-marketing"] });
      qc.invalidateQueries({ queryKey: ["marketing-spend"] });
      qc.invalidateQueries({ queryKey: ["pnl-summary"] });
    },
  });
}
