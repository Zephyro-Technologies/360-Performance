// At-fault corrections data layer. An admin records how an order that went wrong was made
// right: replacement (free re-ship, house stock only), refund (payment reversal, admin-only),
// or compensation (goodwill). All post through the atomic record_correction RPC; the ledger is
// immutable. The original sale is never touched, so investor settlement is never reversed.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type CorrectionAction = Database["public"]["Enums"]["correction_action"];
export type WrongUnitDisposition = Database["public"]["Enums"]["wrong_unit_disposition"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const CORRECTION_ACTION_LABEL: Record<CorrectionAction, string> = { replacement: "Replacement", refund: "Refund", compensation: "Compensation" };
export const DISPOSITION_LABEL: Record<WrongUnitDisposition, string> = { written_off: "Written off", restocked: "Restocked", na: "—" };

const num = (v: unknown) => Number(v ?? 0);

export interface Correction {
  id: string;
  correction_no: string | null;
  action: CorrectionAction;
  amount_pkr: number | null;
  qty: number | null;
  wrong_unit_disposition: WrongUnitDisposition | null;
  reason: string;
  notes: string | null;
  created_at: string;
  product_name: string | null;
  item_name: string | null;
  cost_pkr: number; // the house loss: amount for refund/comp; replacement units' landed cost otherwise
  replacement_order_id: string | null; // the pipeline order a replacement spawned (re-delivery); resolve no./stage from the orders cache
}
type CorrRow = {
  id: string; correction_no: string | null; action: CorrectionAction; amount_pkr: number | null; qty: number | null;
  wrong_unit_disposition: WrongUnitDisposition | null; reason: string; notes: string | null; created_at: string;
  replacement_order_id: string | null;
  products: { name: string } | null; order_items: { name: string } | null;
  stock_movements: { qty: number; batches: { landed_cost_pkr: number } | null }[] | null;
};

export function useOrderCorrections(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order-corrections", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<Correction[]> => {
      const { data, error } = await supabase
        .from("corrections")
        .select(
          "id, correction_no, action, amount_pkr, qty, wrong_unit_disposition, reason, notes, created_at, replacement_order_id, " +
            "products(name), order_items(name), stock_movements(qty, batches(landed_cost_pkr))",
        )
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      const rows = (data ?? []) as unknown as CorrRow[];
      return rows.map((r) => {
        const replCost = (r.stock_movements ?? []).reduce((s, m) => s + num(m.qty) * num(m.batches?.landed_cost_pkr), 0);
        return {
          id: r.id, correction_no: r.correction_no, action: r.action,
          amount_pkr: r.amount_pkr != null ? num(r.amount_pkr) : null,
          qty: r.qty, wrong_unit_disposition: r.wrong_unit_disposition, reason: r.reason, notes: r.notes, created_at: r.created_at,
          product_name: r.products?.name ?? null, item_name: r.order_items?.name ?? null,
          cost_pkr: r.action === "replacement" ? replCost : num(r.amount_pkr),
          replacement_order_id: r.replacement_order_id,
        };
      });
    },
  });
}

// The order's still-reversible customer payments (for a refund), with their remaining amount.
export interface RefundablePayment { id: string; amount_pkr: number; method: PaymentMethod; remaining_pkr: number; invoice_no: string | null }
type InvWithPays = { invoice_no: string | null; payments: { id: string; amount_pkr: number; method: PaymentMethod; kind: string; reverses_payment_id: string | null }[] | null };

export function useOrderRefundablePayments(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order-refundable-payments", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<RefundablePayment[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_no, payments(id, amount_pkr, method, kind, reverses_payment_id)")
        .eq("order_id", orderId!);
      if (error) throw new Error(friendlyError(error));
      const out: RefundablePayment[] = [];
      for (const inv of (data ?? []) as unknown as InvWithPays[]) {
        const pays = inv.payments ?? [];
        const reversed = new Map<string, number>();
        for (const p of pays) if (p.kind === "reversal" && p.reverses_payment_id) reversed.set(p.reverses_payment_id, (reversed.get(p.reverses_payment_id) ?? 0) + num(p.amount_pkr));
        for (const p of pays) {
          if (p.kind !== "payment") continue;
          const remaining = num(p.amount_pkr) - (reversed.get(p.id) ?? 0);
          if (remaining > 0) out.push({ id: p.id, amount_pkr: num(p.amount_pkr), method: p.method, remaining_pkr: remaining, invoice_no: inv.invoice_no });
        }
      }
      return out;
    },
  });
}

const recordSchema = z.object({
  order_id: z.string().uuid(),
  order_item_id: z.string().uuid().nullable(),
  action: z.enum(["replacement", "refund", "compensation"]),
  amount_pkr: z.number().finite().positive().nullable(),
  product_id: z.string().uuid().nullable(),
  qty: z.number().int().positive().nullable(),
  wrong_unit_disposition: z.enum(["written_off", "restocked"]).nullable(),
  payment_id: z.string().uuid().nullable(),
  method: z.enum(["bank_transfer", "cash", "card", "easypaisa", "other"]).nullable(),
  reason: z.string().trim().min(1, "Add a reason"),
  notes: z.string().trim().nullable(),
});
export type RecordCorrectionInput = z.infer<typeof recordSchema>;

export function useRecordCorrection(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordCorrectionInput) => {
      const p = recordSchema.parse(input);
      const args = {
        p_order_id: p.order_id, p_order_item_id: p.order_item_id, p_action: p.action, p_amount_pkr: p.amount_pkr,
        p_product_id: p.product_id, p_qty: p.qty, p_wrong_unit_disposition: p.wrong_unit_disposition,
        p_payment_id: p.payment_id, p_method: p.method, p_reason: p.reason, p_notes: p.notes,
      } as unknown as Database["public"]["Functions"]["record_correction"]["Args"];
      const { error } = await supabase.rpc("record_correction", args);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-corrections", orderId] });
      qc.invalidateQueries({ queryKey: ["order-refundable-payments", orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["pnl-summary"] });
      qc.invalidateQueries({ queryKey: ["products"] }); // a replacement drew stock
    },
  });
}
