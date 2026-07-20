// Vendor advance ledger — working-capital prepaid credit with the 3 logistics vendors
// (payment / air-freight / sea-freight), all paid in PKR. SIMPLE TRACKER, entirely
// OUTSIDE the P&L: the balance is tracked DIRECTLY in PKR (no RMB, no live conversion).
// Immutable append-only ledger — corrections are reversal rows, never edits/deletes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";
import { CURRENCY_CODES } from "./crm";

// Logistics vendors carry a role; product suppliers are vendor accounts with role null (supplier_id set).
export type VendorRole = "payment" | "air_freight" | "sea_freight";
export const VENDOR_ROLE_LABEL: Record<VendorRole, string> = {
  payment: "Payment",
  air_freight: "Air Freight",
  sea_freight: "Sea Freight",
};
export const vendorTag = (b: { role: VendorRole | null }) => (b.role ? VENDOR_ROLE_LABEL[b.role] : "Supplier");

export interface VendorBalance {
  vendor_account_id: string;
  name: string;
  role: VendorRole | null;
  supplier_id: string | null;
  balance_pkr: number; // the parked balance, directly in PKR
}

export function useVendorBalances() {
  return useQuery({
    queryKey: ["vendor-advance-balances"],
    queryFn: async (): Promise<VendorBalance[]> => {
      const { data, error } = await supabase
        .from("vendor_advance_balances")
        .select("vendor_account_id, name, role, supplier_id, balance_pkr")
        .order("name");
      if (error) throw new Error(friendlyError(error));
      // The business tracks three vendor types: product, air-freight, sea-freight. The legacy
      // 'payment' logistics vendor is not used, so it's excluded from the UI.
      return (data ?? [])
        .filter((r) => r.role !== "payment")
        .map((r) => ({ ...r, balance_pkr: Number(r.balance_pkr) })) as VendorBalance[];
    },
  });
}

export interface VendorEntry {
  id: string;
  vendor_account_id: string;
  kind: "topup" | "drawdown";
  amount_pkr: number;
  occurred_on: string;
  note: string | null;
  reverses_id: string | null;
  created_at: string;
  vendor_accounts: { name: string; role: VendorRole } | null;
}

export function useVendorLedger() {
  return useQuery({
    queryKey: ["vendor-advance-ledger"],
    queryFn: async (): Promise<VendorEntry[]> => {
      const { data, error } = await supabase
        .from("vendor_advance_entries")
        .select(
          "id, vendor_account_id, kind, amount_pkr, occurred_on, note, reverses_id, created_at, vendor_accounts(name, role)",
        )
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? [])
        .filter((r) => (r as { vendor_accounts: { role: string | null } | null }).vendor_accounts?.role !== "payment")
        .map((r) => ({ ...r, amount_pkr: Number(r.amount_pkr) })) as unknown as VendorEntry[];
    },
  });
}

const entrySchema = z.object({
  vendor_account_id: z.string().uuid("Choose a vendor"),
  kind: z.enum(["topup", "drawdown"]),
  amount_pkr: z.number({ invalid_type_error: "Enter an amount" }).finite("Enter a valid amount").positive("Amount must be more than 0"),
  occurred_on: z.string().min(1).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  purchase_order_id: z.string().uuid().nullable().optional(), // set when paying against a PO in Purchasing
});
export type VendorEntryInput = z.infer<typeof entrySchema>;

export function useRecordAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VendorEntryInput) => {
      const parsed = entrySchema.parse(input);
      const { error } = await supabase.from("vendor_advance_entries").insert({
        vendor_account_id: parsed.vendor_account_id,
        kind: parsed.kind,
        amount_pkr: parsed.amount_pkr,
        occurred_on: parsed.occurred_on || undefined,
        note: parsed.note?.trim() || null,
        purchase_order_id: parsed.purchase_order_id ?? null,
      });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-advance-balances"] });
      qc.invalidateQueries({ queryKey: ["vendor-advance-ledger"] });
    },
  });
}

// Create/edit a logistics vendor account (air-freight / sea-freight). Product vendors are
// created via the product path in VendorDialog (supplier_id + role null); these carry a role
// and no supplier link. Air/sea vendors use the SAME template as product vendors — name +
// contact/phone/country/currency (added in migration 090088). Admin-only per RLS.
const vendorAccountSchema = z.object({
  name: z.string().trim().min(1, "Enter a vendor name"),
  role: z.enum(["air_freight", "sea_freight"]),
  contact: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  country: z.string().trim().nullable(),
  currency: z.enum(CURRENCY_CODES),
});
export type VendorAccountInput = z.infer<typeof vendorAccountSchema>;

export function useCreateVendorAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VendorAccountInput) => {
      const parsed = vendorAccountSchema.parse(input);
      const { error } = await supabase.from("vendor_accounts").insert({
        name: parsed.name,
        role: parsed.role,
        contact: parsed.contact,
        phone: parsed.phone,
        country: parsed.country,
        currency: parsed.currency,
      });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logistics-vendors"] });
      qc.invalidateQueries({ queryKey: ["vendor-advance-balances"] });
      qc.invalidateQueries({ queryKey: ["vendor-advance-ledger"] });
    },
  });
}

// The air-freight / sea-freight vendor accounts, listed for the Data Management → Vendors
// tab alongside product vendors (suppliers). Read straight from vendor_accounts so we get
// `active`; excludes product mirrors (role null) and the legacy 'payment' role.
export interface LogisticsVendor {
  id: string;
  name: string;
  role: "air_freight" | "sea_freight";
  contact: string | null;
  phone: string | null;
  country: string | null;
  currency: string;
  active: boolean;
}
export function useLogisticsVendors() {
  return useQuery({
    queryKey: ["logistics-vendors"],
    queryFn: async (): Promise<LogisticsVendor[]> => {
      const { data, error } = await supabase
        .from("vendor_accounts")
        .select("id, name, role, contact, phone, country, currency, active")
        .in("role", ["air_freight", "sea_freight"])
        .order("name");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        role: r.role as "air_freight" | "sea_freight",
        contact: (r.contact as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        country: (r.country as string | null) ?? null,
        currency: (r.currency as string) ?? "CNY",
        active: Boolean(r.active),
      }));
    },
  });
}

export type VendorAccountUpdate = { id: string } & Omit<VendorAccountInput, "role">;
export function useUpdateVendorAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: VendorAccountUpdate) => {
      const parsed = vendorAccountSchema.omit({ role: true }).parse(input);
      const { error } = await supabase.from("vendor_accounts").update({
        name: parsed.name,
        contact: parsed.contact,
        phone: parsed.phone,
        country: parsed.country,
        currency: parsed.currency,
      }).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logistics-vendors"] });
      qc.invalidateQueries({ queryKey: ["vendor-advance-balances"] });
    },
  });
}

export function useDeleteVendorAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendor_accounts").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logistics-vendors"] });
      qc.invalidateQueries({ queryKey: ["vendor-advance-balances"] });
    },
  });
}

// Admin correction — posts the OPPOSITE-kind entry referencing the one reversed (the
// DB guard enforces equal amount, same account, target not already reversed).
export function useReverseAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: VendorEntry) => {
      const { error } = await supabase.from("vendor_advance_entries").insert({
        vendor_account_id: entry.vendor_account_id,
        kind: entry.kind === "topup" ? "drawdown" : "topup",
        amount_pkr: entry.amount_pkr,
        reverses_id: entry.id,
        note: `Reversal of ${entry.kind} (${entry.occurred_on})`,
      });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-advance-balances"] });
      qc.invalidateQueries({ queryKey: ["vendor-advance-ledger"] });
    },
  });
}
