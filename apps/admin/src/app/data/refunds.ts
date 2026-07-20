// Refunds data layer — React Query over Supabase. Same pattern as expenses (zod, errors.ts,
// invalidate-and-refetch). A standalone log of out-of-pocket money sent back; feeds
// analytics_daily.expense_pkr (by effective month) and pnl_summary.refunds_pkr (lifetime).
// Distinct from the per-order "reverse a payment" correction — see the refunds migration.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type RefundCycle = Database["public"]["Enums"]["refund_cycle"];
export const REFUND_CYCLE_LABEL: Record<RefundCycle, string> = {
  current: "This month",
  next: "Next month",
};

export interface RefundRow {
  id: string;
  amount_pkr: number;
  refunded_on: string;
  deduction_cycle: RefundCycle;
  reason: string;
  order_id: string | null;
  orders: { order_no: string } | null;
}

export function useRefunds() {
  return useQuery({
    queryKey: ["refunds"],
    queryFn: async (): Promise<RefundRow[]> => {
      const { data, error } = await supabase
        .from("refunds")
        .select("id, amount_pkr, refunded_on, deduction_cycle, reason, order_id, orders(order_no)")
        .order("refunded_on", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as unknown as RefundRow[];
    },
  });
}

export const refundSchema = z.object({
  amount_pkr: z.number({ invalid_type_error: "Enter an amount" }).finite("Enter a valid amount").positive("Amount must be more than 0"),
  refunded_on: z.string().min(1, "Pick a date"),
  deduction_cycle: z.enum(["current", "next"]),
  reason: z.string().trim().min(1, "A note is required: say why the money went back"),
  order_id: z.string().uuid().nullable(),
});
export type RefundInput = z.infer<typeof refundSchema>;

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["refunds"] });
  qc.invalidateQueries({ queryKey: ["analytics_daily"] }); // refunds are cash "Money out"
  qc.invalidateQueries({ queryKey: ["pnl-summary"] }); // refunds reduce "What you kept"
}

export function useSaveRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: RefundInput }) => {
      const parsed = refundSchema.parse(input);
      const res = id
        ? await supabase.from("refunds").update(parsed).eq("id", id)
        : await supabase.from("refunds").insert(parsed);
      if (res.error) throw new Error(friendlyError(res.error));
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("refunds").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidate(qc),
  });
}
