// Customer delivery costs data layer — React Query over Supabase. Same pattern as refunds
// (zod, errors.ts, invalidate-and-refetch). Last-mile courier cost to send an order to a
// customer; a ledger with an owed→paid state. Feeds pnl_summary.delivery_pkr (reduces profit).
// Inbound/local shipping is NOT here — that stays in product landed cost (COGS).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export interface DeliveryRow {
  id: string;
  amount_pkr: number;
  billed_on: string;
  paid_on: string | null;
  order_id: string | null;
  courier: string | null;
  note: string | null;
  reverses_id: string | null; // set on a reversal row (negates the original it points at)
  orders: { order_no: string } | null;
}

export function useDeliveries() {
  return useQuery({
    queryKey: ["deliveries"],
    queryFn: async (): Promise<DeliveryRow[]> => {
      const { data, error } = await supabase
        .from("customer_deliveries")
        .select("id, amount_pkr, billed_on, paid_on, order_id, courier, note, reverses_id, orders(order_no)")
        .order("billed_on", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as unknown as DeliveryRow[];
    },
  });
}

export const deliverySchema = z.object({
  amount_pkr: z.number({ invalid_type_error: "Enter an amount" }).finite("Enter a valid amount").positive("Amount must be more than 0"),
  billed_on: z.string().min(1, "Pick a date"),
  paid_on: z.string().nullable(),
  order_id: z.string().uuid().nullable(),
  courier: z.string().trim().nullable(),
  note: z.string().trim().nullable(),
});
export type DeliveryInput = z.infer<typeof deliverySchema>;

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["deliveries"] });
  qc.invalidateQueries({ queryKey: ["pnl-summary"] }); // delivery reduces "What you kept"
}

// Create-only: deliveries are an immutable ledger (no edit, no delete — see migration 090124).
export function useCreateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeliveryInput) => {
      const parsed = deliverySchema.parse(input);
      const { error } = await supabase.from("customer_deliveries").insert(parsed);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidate(qc),
  });
}

// The one legitimate lifecycle transition (owed → paid), through a controlled RPC because raw
// UPDATE is revoked. One-way: un-paying would be editing history — reverse the row instead.
export function useMarkDeliveryPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("mark_delivery_paid", { p_id: id });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

// Correcting a mistake = a signed reversal row (−original), netted in the ORIGINAL's period.
export function useReverseDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: DeliveryRow) => {
      const { error } = await supabase.from("customer_deliveries").insert({
        amount_pkr: -r.amount_pkr,
        billed_on: r.billed_on,
        paid_on: null,
        order_id: r.order_id,
        courier: r.courier,
        note: `Reversal of delivery${r.courier ? ` · ${r.courier}` : ""}`,
        reverses_id: r.id,
      });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidate(qc),
  });
}
