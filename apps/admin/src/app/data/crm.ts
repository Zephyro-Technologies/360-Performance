// Customers + Suppliers data layer — React Query over Supabase. Same pattern as
// catalog.ts: zod-guarded, server-authoritative (invalidate-and-refetch).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export type Customer = Pick<
  CustomerRow,
  "id" | "name" | "email" | "phone" | "city" | "type" | "address" | "province" | "postal_code" | "since"
> & { ordersCount: number };

export const CUSTOMER_TYPES = ["retail", "trade", "workshop"] as const;
export const CURRENCY_CODES = ["PKR", "USD", "CNY", "EUR", "AED", "JPY", "GBP"] as const;

// ---- customers ----
export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone, city, type, address, province, postal_code, since, orders(count)")
        .order("name");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((c) => {
        const { orders, ...rest } = c as typeof c & { orders: { count: number }[] };
        return { ...rest, ordersCount: orders?.[0]?.count ?? 0 } as Customer;
      });
    },
  });
}

// Total each customer has paid across their invoices (net of reversals, excluding voided invoices).
// Keyed by customer_id for O(1) lookup alongside useCustomers().
export function useCustomerPaid() {
  return useQuery({
    queryKey: ["customer-paid"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount_pkr, kind, invoices!inner(customer_id, voided_at)");
      if (error) throw new Error(friendlyError(error));
      const out: Record<string, number> = {};
      for (const r of (data ?? []) as unknown as { amount_pkr: number; kind: string; invoices: { customer_id: string; voided_at: string | null } | null }[]) {
        const inv = r.invoices;
        if (!inv || inv.voided_at) continue;
        out[inv.customer_id] = (out[inv.customer_id] ?? 0) + Number(r.amount_pkr) * (r.kind === "reversal" ? -1 : 1);
      }
      return out;
    },
  });
}

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email").nullable(),
  phone: z.string().trim().nullable(),
  city: z.string().trim().nullable(),
  type: z.enum(CUSTOMER_TYPES),
  address: z.string().trim().nullable(),
  province: z.string().trim().nullable(),
  postal_code: z.string().trim().nullable(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CustomerInput }) => {
      const parsed = customerSchema.parse(input);
      const res = id
        ? await supabase.from("customers").update(parsed).eq("id", id)
        : await supabase.from("customers").insert(parsed);
      if (res.error) throw new Error(friendlyError(res.error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

// ---- suppliers ----
export interface SupplierRow {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  country: string | null;
  currency: string;
  active: boolean;
}

// Product-source vendor master. Cost/products now relate via Purchase Orders (Phase 2),
// not a direct products.supplier_id link, so the list is the vendor records themselves.
export function useSuppliersList() {
  return useQuery({
    queryKey: ["suppliers", "list"],
    queryFn: async (): Promise<SupplierRow[]> => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, contact, phone, country, currency, active")
        .order("name");
      if (error) throw new Error(friendlyError(error));
      return data ?? [];
    },
  });
}

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  contact: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  country: z.string().trim().nullable(),
  currency: z.enum(CURRENCY_CODES),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export function useSaveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SupplierInput }) => {
      const parsed = supplierSchema.parse(input);
      const res = id
        ? await supabase.from("suppliers").update(parsed).eq("id", id)
        : await supabase.from("suppliers").insert(parsed);
      if (res.error) throw new Error(friendlyError(res.error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
