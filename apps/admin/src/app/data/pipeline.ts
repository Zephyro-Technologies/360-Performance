// Procurement pipeline data layer — planned purchases (the "Future Orders" wishlist) +
// graduation into a real PO. A planned item tolerates a free-text name (researched before
// it's a catalogue product); graduation needs a linked product + vendor.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type PlanPriority = Database["public"]["Enums"]["plan_priority"];
export type PlanStatus = Database["public"]["Enums"]["plan_status"];

export const PRIORITY_ORDER: PlanPriority[] = ["high", "medium", "low"];
export const PRIORITY_LABEL: Record<PlanPriority, string> = { high: "High", medium: "Medium", low: "Low" };
export const STATUS_FLOW: PlanStatus[] = ["researching", "quoted", "planning", "approved", "ordered", "dropped"];
export const STATUS_LABEL: Record<PlanStatus, string> = {
  researching: "Researching",
  quoted: "Quoted",
  planning: "Planning",
  approved: "Approved",
  ordered: "Ordered",
  dropped: "Dropped",
};
// Operator-settable statuses (ordered is reached only by graduating).
export const SETTABLE_STATUS: PlanStatus[] = ["researching", "quoted", "planning", "approved", "dropped"];

export interface PlannedPurchase {
  id: string;
  item_name: string;
  product_id: string | null;
  supplier_id: string | null;
  planned_qty: number | null;
  est_unit_cost_pkr: number | null;
  target_retail_pkr: number | null;
  priority: PlanPriority;
  status: PlanStatus;
  notes: string | null;
  graduated_to_po_id: string | null;
  created_at: string;
  products: { name: string; sku: string; category_id: string | null } | null;
  suppliers: { name: string } | null;
  purchase_orders: { po_no: string | null } | null;
}

export function usePlannedPurchases() {
  return useQuery({
    queryKey: ["planned-purchases"],
    queryFn: async (): Promise<PlannedPurchase[]> => {
      const { data, error } = await supabase
        .from("planned_purchases")
        .select(
          "id, item_name, product_id, supplier_id, planned_qty, est_unit_cost_pkr, target_retail_pkr, priority, status, notes, graduated_to_po_id, created_at, " +
            "products(name, sku, category_id), suppliers(name), purchase_orders(po_no)",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      const rows = (data ?? []) as unknown as PlannedPurchase[];
      // worklist order: priority (high first), then newest.
      return rows.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
    },
  });
}

const plannedSchema = z.object({
  item_name: z.string().trim().min(1, "What are you planning to buy?"),
  product_id: z.string().uuid().nullable(),
  supplier_id: z.string().uuid().nullable(),
  planned_qty: z.number().int().positive().nullable(),
  est_unit_cost_pkr: z.number().finite().nonnegative().nullable(),
  target_retail_pkr: z.number().finite().nonnegative().nullable(),
  priority: z.enum(["high", "medium", "low"]),
  status: z.enum(["researching", "quoted", "planning", "approved", "dropped"]),
  notes: z.string().trim().nullable(),
});
export type PlannedInput = z.infer<typeof plannedSchema>;

export function useCreatePlanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlannedInput) => {
      const parsed = plannedSchema.parse(input);
      const { error } = await supabase.from("planned_purchases").insert(parsed);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planned-purchases"] }),
  });
}

export function useUpdatePlanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<PlannedInput>) => {
      const { error } = await supabase.from("planned_purchases").update(patch).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planned-purchases"] }),
  });
}

export function useDeletePlanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planned_purchases").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planned-purchases"] }),
  });
}

// Graduate into a real PO (server-authoritative RPC). Refreshes POs too.
export function useGraduatePlanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { data, error } = await supabase.rpc("graduate_planned_purchase", { p_id: id });
      if (error) throw new Error(friendlyError(error));
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planned-purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}
