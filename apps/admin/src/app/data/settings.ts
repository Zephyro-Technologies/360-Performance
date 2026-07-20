// Settings data layer — the `settings` singleton (id = true). Currently holds the tax
// rule (read server-side by create_invoice / update_invoice, not from here) and the bank
// details printed on every invoice. Reads are staff/admin/viewer; writes are ADMIN-ONLY,
// enforced by RLS — `can("manage")` in the UI is a convenience, not the guard.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export interface BankDetails {
  bank_name: string | null;
  account_title: string | null;
  iban: string | null;
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async (): Promise<BankDetails> => {
      const { data, error } = await supabase
        .from("settings")
        .select("bank_name, account_title, iban")
        .eq("id", true)
        .single();
      if (error) throw new Error(friendlyError(error));
      return data;
    },
  });
}

// Trim to null: an empty box means "not set", and the invoice hides an unset line
// rather than printing a stray label with nothing after it.
const blankToNull = z
  .string()
  .max(120, "Too long")
  .transform((s) => s.trim() || null)
  .nullable();

export const bankDetailsSchema = z.object({
  bank_name: blankToNull,
  account_title: blankToNull,
  iban: blankToNull,
});
export type BankDetailsInput = z.input<typeof bankDetailsSchema>;

// The house default reorder point (migration 090115). Read separately from the bank details so a
// catalogue screen doesn't pull invoice fields it has no use for.
export function useLowStockDefault() {
  return useQuery({
    queryKey: ["settings", "low-stock"],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from("settings").select("low_stock_threshold").eq("id", true).single();
      if (error) throw new Error(friendlyError(error));
      return data.low_stock_threshold;
    },
  });
}

export function useUpdateLowStockDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: number) => {
      const parsed = z.number().int("Use a whole number").nonnegative("Threshold can't be negative").parse(value);
      const { error } = await supabase.from("settings").update({ low_stock_threshold: parsed }).eq("id", true);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      // availability is server-derived from the threshold, so every product's badge can change.
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateBankDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BankDetailsInput) => {
      const parsed = bankDetailsSchema.parse(input);
      const { error } = await supabase.from("settings").update(parsed).eq("id", true);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}
