// Quotations data layer — DB-backed (React Query over Supabase), mirroring invoices.
// A quotation is a price estimate: header + snapshot line items (brand + sea/air), tier
// priced at issue time via the create_quotation RPC. No payments/tax/void — total = subtotal.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export interface QuotationCustomerSnapshot {
  source: "existing" | "new";
  id: string | null;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  city: string | null;
}

export interface QuotationItemSnapshot {
  // Present on lines read back from the DB; absent when building a new quote's lines.
  id?: string;
  product_id: string;
  name: string;
  sku: string | null;
  brand?: string | null;
  shipping_type: "sea" | "air";
  price_pkr: number;
  qty: number;
}

export interface CreateQuotationInput {
  customer: QuotationCustomerSnapshot;
  items: QuotationItemSnapshot[];
  notes: string;
  order_id: string | null;
  order_no: string | null;
}

export interface QuotationRecord {
  id: string;
  quote_no: string;
  issue_date: string;
  subtotal_pkr: number;
  total_pkr: number;
  notes: string;
  order_id: string | null;
  order_no: string | null;
  customer: QuotationCustomerSnapshot;
  items: QuotationItemSnapshot[];
}

const LIST_COLUMNS =
  "id, quote_no, customer_id, order_id, subtotal_pkr, total_pkr, notes, issue_date, " +
  "customers(name, email, phone, city, type), orders(order_no), " +
  "quotation_items(id, product_id, name, sku, brand, qty, price_pkr, shipping_type)";

interface QuotationRow {
  id: string;
  quote_no: string | null;
  customer_id: string;
  order_id: string | null;
  subtotal_pkr: number;
  total_pkr: number;
  notes: string | null;
  issue_date: string;
  customers: { name: string; email: string | null; phone: string | null; city: string | null; type: string } | null;
  orders: { order_no: string | null } | null;
  quotation_items: {
    id: string;
    product_id: string | null;
    name: string;
    sku: string | null;
    brand: string | null;
    qty: number;
    price_pkr: number;
    shipping_type: string;
  }[];
}

function toRecord(row: QuotationRow): QuotationRecord {
  return {
    id: row.id,
    quote_no: row.quote_no ?? "",
    issue_date: row.issue_date,
    subtotal_pkr: Number(row.subtotal_pkr),
    total_pkr: Number(row.total_pkr),
    notes: row.notes ?? "",
    order_id: row.order_id,
    order_no: row.orders?.order_no ?? null,
    customer: {
      source: "existing",
      id: row.customer_id,
      name: row.customers?.name ?? "Unknown",
      type: row.customers?.type ?? "retail",
      email: row.customers?.email ?? null,
      phone: row.customers?.phone ?? null,
      city: row.customers?.city ?? null,
    },
    items: (row.quotation_items ?? []).map((it) => ({
      id: it.id,
      product_id: it.product_id ?? "",
      name: it.name,
      sku: it.sku,
      brand: it.brand,
      shipping_type: it.shipping_type === "air" ? "air" : "sea",
      price_pkr: Number(it.price_pkr),
      qty: it.qty,
    })),
  };
}

// Single hook the Invoices page consumes: the list plus create/delete actions (async),
// so quotes persist in the DB (cross-device, RLS-guarded) instead of one browser.
// Quotations linked to an order (there can be several) — for the order's detail drawer.
export function useOrderQuotations(orderId: string | null) {
  return useQuery({
    queryKey: ["order-quotations", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<{ id: string; quote_no: string | null; total_pkr: number }[]> => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("quotations").select("id, quote_no, total_pkr").eq("order_id", orderId).order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((r) => ({ id: r.id, quote_no: r.quote_no, total_pkr: Number(r.total_pkr) }));
    },
  });
}

// One quotation by id — mirrors useInvoice, so a viewer can open a quote without the whole list
// being loaded (and without being bound to the list's filtering).
export function useQuotation(id: string | null) {
  return useQuery({
    queryKey: ["quotation", id],
    enabled: !!id,
    queryFn: async (): Promise<QuotationRecord | null> => {
      if (!id) return null;
      const { data, error } = await supabase.from("quotations").select(LIST_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(friendlyError(error));
      return data ? toRecord(data as unknown as QuotationRow) : null;
    },
  });
}

export function useQuotations() {
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["quotations"],
    queryFn: async (): Promise<QuotationRecord[]> => {
      const { data, error } = await supabase
        .from("quotations")
        .select(LIST_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return ((data ?? []) as unknown as QuotationRow[]).map(toRecord);
    },
  });

  const createMut = useMutation({
    mutationFn: async (input: CreateQuotationInput): Promise<QuotationRecord> => {
      const args = {
        p_customer_id: input.customer.source === "existing" ? input.customer.id : null,
        p_new_customer:
          input.customer.source === "new"
            ? {
                name: input.customer.name,
                type: input.customer.type,
                email: input.customer.email,
                phone: input.customer.phone,
                city: input.customer.city,
              }
            : null,
        p_order_id: input.order_id,
        p_items: input.items,
        p_notes: input.notes,
      } as unknown as Database["public"]["Functions"]["create_quotation"]["Args"];
      const { data, error } = await supabase.rpc("create_quotation", args);
      if (error) throw new Error(friendlyError(error));
      return toRecord({ ...(data as unknown as QuotationRow), quotation_items: [], customers: null, orders: null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["order-quotations"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotations").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["order-quotations"] });
    },
  });

  return useMemo(
    () => ({
      quotations: listQ.data ?? [],
      isLoading: listQ.isLoading,
      isError: listQ.isError,
      error: listQ.error as Error | null,
      createQuotation: (input: CreateQuotationInput) => createMut.mutateAsync(input),
      deleteQuotation: (id: string) => deleteMut.mutateAsync(id),
    }),
    [listQ.data, listQ.isLoading, listQ.isError, listQ.error, createMut, deleteMut],
  );
}

// Edit a quotation's lines + notes (freely — a quote is an estimate, no payment/void gate,
// unlike invoices). Mirrors update_quotation (migration 090087).
export interface UpdateQuotationInput {
  id: string;
  items: QuotationItemSnapshot[];
  notes: string;
}
export function useUpdateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateQuotationInput) => {
      const args = {
        p_id: input.id,
        // name/sku/brand must survive: a product-less (one-off) line has nothing else to
        // rebuild itself from, and update_quotation rejects it outright without a name.
        // Catalogue lines re-read these from `products`, so sending them is harmless there.
        p_items: input.items.map((i) => ({
          product_id: i.product_id,
          qty: i.qty,
          price_pkr: i.price_pkr,
          shipping_type: i.shipping_type,
          name: i.name,
          sku: i.sku,
          brand: i.brand ?? null,
        })),
        p_notes: input.notes,
      } as unknown as Database["public"]["Functions"]["update_quotation"]["Args"];
      const { error } = await supabase.rpc("update_quotation", args);
      if (error) throw new Error(friendlyError(error));
    },
    // The list is not the only reader: an order's detail shows its quotes via
    // ["order-quotations", orderId] and opens one via ["quotation", id]. Invalidating only
    // ["quotations"] left both showing the pre-edit total until a page reload.
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["quotation", v.id] });
      qc.invalidateQueries({ queryKey: ["order-quotations"] });
    },
  });
}

// The (possibly edited) final line the operator confirms when promoting — they're prompted to
// adjust the unit price ("final cost") before the invoice is raised.
export interface PromoteLine {
  product_id: string;
  qty: number;
  price_pkr: number;
  shipping_type: "sea" | "air";
  // Carried for product-less (one-off) lines, which have nothing else to identify them.
  name?: string;
  sku?: string | null;
  brand?: string | null;
}

// Promote a quotation to an invoice — INVOICE ONLY (no order yet). The operator confirms the
// final prices, an invoice is raised (carrying that amount, server-computed) and linked back to
// its source quotation (invoices.quotation_id). The order pipeline is started separately, via a
// button on the invoice (link_invoice_order). The QUOTATION ITSELF IS NEVER MODIFIED.
export function usePromoteQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quote, items }: { quote: QuotationRecord; items: PromoteLine[] }): Promise<{ invoiceId: string }> => {
      if (quote.customer.source !== "existing" || !quote.customer.id) {
        throw new Error("This quotation has no saved customer to invoice.");
      }
      // A line is invoiceable if it has a product OR (being a one-off) a name — create_invoice
      // accepts both. Filtering on product_id alone silently dropped one-off lines, so the
      // invoice came out cheaper than the quote it was promoted from.
      const lines = items.filter((i) => i.product_id || (i.name ?? "").trim());
      if (lines.length === 0) throw new Error("This quotation has no lines to invoice.");

      const invoiceArgs = {
        p_customer_id: quote.customer.id,
        p_new_customer: null,
        p_order_id: null,
        p_items: lines.map((i) => ({
          product_id: i.product_id,
          qty: i.qty,
          price_pkr: i.price_pkr,
          shipping_type: i.shipping_type,
          name: i.name,
          sku: i.sku ?? null,
          brand: i.brand ?? null,
        })),
        p_due_date: null,
      } as unknown as Database["public"]["Functions"]["create_invoice"]["Args"];
      const { data: inv, error: invErr } = await supabase.rpc("create_invoice", invoiceArgs);
      if (invErr) throw new Error(friendlyError(invErr));
      const invoiceId = (inv as unknown as { id: string }).id;

      // Link the invoice back to the quotation it came from (staff/admin may update invoices).
      const { error: linkErr } = await supabase.from("invoices").update({ quotation_id: quote.id }).eq("id", invoiceId);
      if (linkErr) throw new Error(friendlyError(linkErr));

      return { invoiceId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["order-invoice"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
