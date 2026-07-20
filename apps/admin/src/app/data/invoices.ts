// Invoices/Payments data layer — React Query over Supabase. Invoice creation goes
// through the create_invoice RPC (atomic, snapshot lines, settings-driven tax).
// Balance/status come from the invoice_balances view (net of reversals). Payments
// are an immutable ledger: record (staff/admin) or reverse (admin) — never edit.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";
import { newCustomerDraftSchema, orderItemSchema } from "./orders";

export type ShippingType = "sea" | "air";
export const shippingTypeSchema = z.enum(["sea", "air"]).default("sea");
export const invoiceItemSchema = orderItemSchema.extend({
  shipping_type: shippingTypeSchema,
  // Per-line discount as a fraction (0.1 = 10% off). The server resolves it to rupees.
  discount_pct: z
    .number({ invalid_type_error: "Discount must be a number" })
    .min(0, "Discount can't be negative")
    .max(1, "Discount can't exceed 100%")
    .optional(),
  // Carried on product-less (one-off) lines — the RPC needs the name, and keeps sku/brand
  // on the snapshot. Catalogue lines re-read these from `products` and ignore them.
  sku: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
});

// The rupee discount for one line, mirroring what create_invoice/update_invoice store:
// round(qty * price * pct, 2), per line. `pctWhole` is the percent as typed (10 = 10% off).
//
// Must round PER LINE, not on the document total — the server rounds each line, so summing
// unrounded lines would show the operator a total the RPC then disagrees with. This is the
// single definition; the create and edit dialogs both use it so they cannot drift apart.
export function lineDiscountPkr(price: number, qty: number, pctWhole: number): number {
  return Math.round(price * qty * (pctWhole / 100) * 100) / 100;
}

// The operator can express a discount two ways: type the percentage, or just type the price
// they agreed (1900 -> 1700) and let us back-solve it. These keep the two in step.
//
// The list price is always what gets stored as price_pkr; the discount carries the difference.
// discount_pct is numeric(9,8) (migration 090114) precisely so a percentage derived here —
// 200/1900 = 10.526315789…% — survives the round trip and re-nets to exactly 1700.

/** Percentage off, back-solved from an agreed price. 0 when there is no reduction. */
export function pctFromPrice(listPrice: number, agreedPrice: number): number {
  if (listPrice <= 0 || agreedPrice >= listPrice) return 0;
  return ((listPrice - agreedPrice) / listPrice) * 100;
}

/** The effective unit price a percentage produces — the inverse of pctFromPrice. */
export function priceFromPct(listPrice: number, pctWhole: number): number {
  return Math.round(listPrice * (1 - pctWhole / 100) * 100) / 100;
}

export type InvoiceStatus = "void" | "paid" | "overdue" | "partial" | "unpaid";
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type PaymentKind = Database["public"]["Enums"]["payment_kind"];

export interface InvoiceBalance {
  paid_pkr: number;
  balance_pkr: number;
  status: InvoiceStatus;
}

export interface InvoiceListItem {
  id: string;
  invoice_no: string | null;
  customer_id: string;
  order_id: string | null;
  subtotal_pkr: number;
  discount_pkr: number;
  tax_pkr: number;
  total_pkr: number;
  issue_date: string;
  due_date: string | null;
  voided_at: string | null;
  customers: { name: string } | null;
  orders: { order_no: string | null } | null;
  invoice_items: { shipping_type: ShippingType }[];
  balance: InvoiceBalance | null;
}

export interface InvoicePayment {
  id: string;
  amount_pkr: number;
  method: PaymentMethod;
  paid_on: string;
  kind: PaymentKind;
  reverses_payment_id: string | null;
  created_at: string;
}
export interface InvoiceItem {
  id: string;
  product_id: string | null;
  name: string;
  sku: string | null;
  brand: string | null;
  qty: number;
  price_pkr: number;
  // Per-line discount: the fraction the operator typed, plus the rupee figure the server froze
  // at write time. Never recompute the rupees on the client — the stored one is authoritative.
  discount_pct: number;
  discount_pkr: number;
  shipping_type: ShippingType;
}
export interface InvoiceDetailRow extends Omit<InvoiceListItem, "customers"> {
  customers: { name: string; email: string | null; phone: string | null; city: string | null; type: string } | null;
  invoice_items: InvoiceItem[];
  payments: InvoicePayment[];
  quotation_id: string | null;
  quotations: { quote_no: string | null } | null;
}

const LIST_COLUMNS =
  "id, invoice_no, customer_id, order_id, subtotal_pkr, discount_pkr, tax_pkr, total_pkr, issue_date, due_date, voided_at, customers(name), orders(order_no), invoice_items(shipping_type)";
const DETAIL_COLUMNS =
  "id, invoice_no, customer_id, order_id, subtotal_pkr, discount_pkr, tax_pkr, total_pkr, issue_date, due_date, voided_at, " +
  "customers(name, email, phone, city, type), orders(order_no), quotation_id, quotations(quote_no), " +
  "invoice_items(id, product_id, name, sku, brand, qty, price_pkr, discount_pct, discount_pkr, shipping_type), " +
  "payments(id, amount_pkr, method, paid_on, kind, reverses_payment_id, created_at)";

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async (): Promise<InvoiceListItem[]> => {
      const [inv, bal] = await Promise.all([
        supabase.from("invoices").select(LIST_COLUMNS).order("created_at", { ascending: false }),
        supabase.from("invoice_balances").select("invoice_id, paid_pkr, balance_pkr, status"),
      ]);
      if (inv.error) throw new Error(friendlyError(inv.error));
      if (bal.error) throw new Error(friendlyError(bal.error));
      const byId = new Map((bal.data ?? []).map((b) => [b.invoice_id, b]));
      return (inv.data ?? []).map((i) => ({
        ...i,
        balance: (byId.get((i as { id: string }).id) ?? null) as InvoiceBalance | null,
      })) as unknown as InvoiceListItem[];
    },
  });
}

export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: ["invoice", id],
    enabled: !!id,
    queryFn: async (): Promise<InvoiceDetailRow | null> => {
      if (!id) return null;
      const [inv, bal] = await Promise.all([
        supabase.from("invoices").select(DETAIL_COLUMNS).eq("id", id).single(),
        supabase.from("invoice_balances").select("paid_pkr, balance_pkr, status").eq("invoice_id", id).single(),
      ]);
      if (inv.error) throw new Error(friendlyError(inv.error));
      return { ...(inv.data as unknown as InvoiceDetailRow), balance: (bal.data ?? null) as InvoiceBalance | null };
    },
  });
}

// The billed lines of an order's live invoice, so the order table can show what the customer is
// ACTUALLY being charged — including a discount the order's own lines can't carry.
//
// Why this is needed: sync_order_from_invoice (090113) mirrors price/discount onto the order,
// but skips lines that are already delivered — freeze_drawn_order_item forbids repricing
// realized revenue. Discounting the invoice of a delivered order therefore leaves the order
// line at its old figure, and the discount would be invisible on the board. Reading the
// invoice directly shows it without rewriting a booked sale.
export interface OrderInvoiceLine {
  product_id: string | null;
  name: string;
  qty: number;
  price_pkr: number;
  discount_pct: number;
  discount_pkr: number;
}
export function useOrderInvoiceLines(orderId: string | null) {
  return useQuery({
    queryKey: ["order-invoice-lines", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<OrderInvoiceLine[]> => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_items(product_id, name, qty, price_pkr, discount_pct, discount_pkr)")
        .eq("order_id", orderId).is("voided_at", null).maybeSingle();
      if (error) throw new Error(friendlyError(error));
      return ((data?.invoice_items ?? []) as OrderInvoiceLine[]).map((l) => ({
        ...l,
        price_pkr: Number(l.price_pkr),
        discount_pct: Number(l.discount_pct),
        discount_pkr: Number(l.discount_pkr),
      }));
    },
  });
}

// The single live (non-void) invoice for an order, with its status — for the order's invoice
// badge. One-invoice-per-order is enforced in the DB, so this is 0 or 1.
export interface OrderInvoice {
  id: string;
  invoice_no: string | null;
  total_pkr: number;
  status: InvoiceStatus;
  balance_pkr: number;
}
export function useOrderInvoice(orderId: string | null) {
  return useQuery({
    queryKey: ["order-invoice", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<OrderInvoice | null> => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("invoices").select("id, invoice_no, total_pkr")
        .eq("order_id", orderId).is("voided_at", null).maybeSingle();
      if (error) throw new Error(friendlyError(error));
      if (!data) return null;
      const { data: bal } = await supabase.from("invoice_balances").select("status, balance_pkr").eq("invoice_id", data.id).single();
      return { id: data.id, invoice_no: data.invoice_no, total_pkr: Number(data.total_pkr), status: (bal?.status ?? "unpaid") as InvoiceStatus, balance_pkr: Number(bal?.balance_pkr ?? 0) };
    },
  });
}

// A single order's customer + items, to prefill an invoice created from that order.
export function useOrderForInvoice(orderId: string | null) {
  return useQuery({
    queryKey: ["order-for-invoice", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_no, customer_id, customers(id, name, type, phone, email, city), order_items(product_id, name, qty, price_pkr, oneoff_product_id)")
        .eq("id", orderId).single();
      if (error) throw new Error(friendlyError(error));
      return data;
    },
  });
}

// Existing customer's orders, to optionally link + prefill invoice items.
export function useCustomerOrders(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-orders", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_no, total_pkr, order_items(product_id, name, qty, price_pkr, oneoff_product_id)")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return data ?? [];
    },
  });
}

export const createInvoiceSchema = z
  .object({
    customer_id: z.string().uuid().nullable(),
    new_customer: newCustomerDraftSchema.nullable(),
    order_id: z.string().uuid().nullable(),
    items: z.array(invoiceItemSchema).min(1, "Add at least one item"),
    due_date: z.string().nullable(),
  })
  .refine((v) => v.customer_id || v.new_customer, { message: "Choose or add a customer" });
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const parsed = createInvoiceSchema.parse(input);
      const args = {
        p_customer_id: parsed.customer_id,
        p_new_customer: parsed.new_customer,
        p_order_id: parsed.order_id,
        p_items: parsed.items,
        p_due_date: parsed.due_date,
      } as unknown as Database["public"]["Functions"]["create_invoice"]["Args"];
      const { data, error } = await supabase.rpc("create_invoice", args);
      if (error) throw new Error(friendlyError(error));
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["order-invoice"] });       // the order's invoice badge
      qc.invalidateQueries({ queryKey: ["order-invoice-lines"] }); // the billed figures on its table
    },
  });
}

// Editing an issued invoice is the exception, not the rule — the update_invoice RPC is
// admin-only and refuses a voided invoice or one with ANY payment row (reverse the payment
// first). See migration 20260622090083 for why that window is the only safe one.
export const updateInvoiceSchema = z.object({
  id: z.string().uuid(),
  items: z.array(invoiceItemSchema).min(1, "Add at least one item"),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateInvoiceInput) => {
      const parsed = updateInvoiceSchema.parse(input);
      const args = {
        p_id: parsed.id,
        p_items: parsed.items,
      } as unknown as Database["public"]["Functions"]["update_invoice"]["Args"];
      const { data, error } = await supabase.rpc("update_invoice", args);
      if (error) throw new Error(friendlyError(error));
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", v.id] });
      // Editing the lines moves the total, so the balance too — the order's invoice badge
      // ("status · balance X") reads its own query and was left showing the pre-edit figure.
      qc.invalidateQueries({ queryKey: ["order-invoice"] });
      qc.invalidateQueries({ queryKey: ["order-invoice-lines"] });
      // update_invoice also mirrors price/discount onto the linked order's undelivered lines
      // (sync_order_from_invoice, migration 090113), so the order table, its total and the
      // costs/profit panel are all stale until these refetch.
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-costs"] });
    },
  });
}

const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount_pkr: z.number({ invalid_type_error: "Amount must be a number" }).finite().positive("Amount must be greater than 0"),
  method: z.enum(["bank_transfer", "cash", "card", "easypaisa", "other"]),
});
export type RecordPaymentInput = z.infer<typeof paymentSchema>;

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordPaymentInput) => {
      const p = paymentSchema.parse(input);
      const { error } = await supabase.from("payments").insert({ ...p, kind: "payment" });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", v.invoice_id] });
      qc.invalidateQueries({ queryKey: ["order-invoice"] });
      qc.invalidateQueries({ queryKey: ["order-invoice-lines"] });
      qc.invalidateQueries({ queryKey: ["orders"] }); // a paid standalone invoice auto-creates its order
    },
  });
}

export function useReversePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { invoice_id: string; payment_id: string; amount_pkr: number; method: PaymentMethod }) => {
      const { error } = await supabase
        .from("payments")
        .insert({ invoice_id: v.invoice_id, amount_pkr: v.amount_pkr, method: v.method, kind: "reversal", reverses_payment_id: v.payment_id });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", v.invoice_id] });
      qc.invalidateQueries({ queryKey: ["order-invoice"] });
      qc.invalidateQueries({ queryKey: ["order-invoice-lines"] });
    },
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // server-authoritative timestamp (voided_at = now()) via RPC
      const { error } = await supabase.rpc("void_invoice", { p_id: id });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["order-invoice"] });
      qc.invalidateQueries({ queryKey: ["order-invoice-lines"] });
    },
  });
}

// Manually start the order pipeline for an invoice (a button on the invoice), before/without
// payment — link_invoice_order creates the order from the invoice's lines and links it back.
export function useLinkInvoiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.rpc("link_invoice_order", { p_invoice_id: invoiceId });
      if (error) throw new Error(friendlyError(error));
      return data as unknown as { id: string; order_no: string | null };
    },
    onSuccess: (_d, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-invoice"] });
      qc.invalidateQueries({ queryKey: ["order-invoice-lines"] });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}
