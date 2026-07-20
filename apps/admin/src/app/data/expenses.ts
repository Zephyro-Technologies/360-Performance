// Expenses data layer — React Query over Supabase. Same pattern (zod, errors.ts,
// invalidate-and-refetch). Feeds analytics_daily.expense_pkr (Money Out / profit).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type ExpenseCategory = Database["public"]["Enums"]["expense_category"];
// Loggable = OPERATING expenses only. Inventory + shipping are COGS (batch/PO system) and
// marketing is its own ledger (Phase 8) — all blocked by the DB `expenses_opex_only` CHECK.
export const EXPENSE_CATEGORIES = ["operations", "salaries", "rent", "subscriptions", "other"] as const;
export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  operations: "Operations",
  salaries: "Salaries",
  rent: "Rent",
  subscriptions: "Subscriptions",
  other: "Other",
  // legacy — no longer loggable, kept so any historical rows still render with a label
  inventory: "Inventory (COGS)",
  shipping: "Shipping (COGS)",
  marketing: "Marketing",
};

export interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  amount_pkr: number;
  spent_on: string;
  note: string | null;
  supplier_id: string | null;
  order_id: string | null;
  receipt_path: string | null;
  suppliers: { name: string } | null;
}

export function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: async (): Promise<ExpenseRow[]> => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, category, amount_pkr, spent_on, note, supplier_id, order_id, receipt_path, suppliers(name)")
        .order("spent_on", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as unknown as ExpenseRow[];
    },
  });
}

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount_pkr: z.number({ invalid_type_error: "Enter an amount" }).finite("Enter a valid amount").nonnegative("Amount must be 0 or more"),
  spent_on: z.string().min(1, "Pick a date"),
  note: z.string().trim().nullable(),
  supplier_id: z.string().uuid().nullable(),
  receipt_path: z.string().nullable(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export function useSaveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ExpenseInput }) => {
      const parsed = expenseSchema.parse(input);
      const res = id
        ? await supabase.from("expenses").update(parsed).eq("id", id)
        : await supabase.from("expenses").insert(parsed);
      if (res.error) throw new Error(friendlyError(res.error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["analytics_daily"] });
      qc.invalidateQueries({ queryKey: ["pnl-summary"] }); // opex feeds "What you kept"
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["analytics_daily"] });
      qc.invalidateQueries({ queryKey: ["pnl-summary"] }); // opex feeds "What you kept"
    },
  });
}
