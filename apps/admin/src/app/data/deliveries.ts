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
  orders: { order_no: string } | null;
}

export function useDeliveries() {
  return useQuery({
    queryKey: ["deliveries"],
    queryFn: async (): Promise<DeliveryRow[]> => {
      const { data, error } = await supabase
        .from("customer_deliveries")
        .select("id, amount_pkr, billed_on, paid_on, order_id, courier, note, orders(order_no)")
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

export function useSaveDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: DeliveryInput }) => {
      const parsed = deliverySchema.parse(input);
      const res = id
        ? await supabase.from("customer_deliveries").update(parsed).eq("id", id)
        : await supabase.from("customer_deliveries").insert(parsed);
      if (res.error) throw new Error(friendlyError(res.error));
    },
    onSuccess: () => invalidate(qc),
  });
}

// Toggle owed ⇄ paid (sets or clears paid_on; profit is unaffected — cost is already counted).
export function useSetDeliveryPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paid_on }: { id: string; paid_on: string | null }) => {
      const { error } = await supabase.from("customer_deliveries").update({ paid_on }).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useDeleteDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_deliveries").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidate(qc),
  });
}
