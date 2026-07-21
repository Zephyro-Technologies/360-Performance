// Orders data layer — React Query over Supabase. Order creation goes through the
// create_order RPC (transactional: inline customer + order + snapshot items +
// server-computed pre-tax total). Stage changes are plain updates; a DB trigger
// writes the order_stage_events history. Server-authoritative (no optimistic).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type OrderStage = Database["public"]["Enums"]["order_stage"];

// Operator workflow stages — manually advanceable (stops at shipped). Delivery
// (partially_delivered / delivered) is reached only by fulfilling lines, never a manual click.
// NOTE: "processing" is a retired stage (still a valid DB enum value, so it stays in the maps below
// for type-completeness + legacy rows) but is no longer part of the flow or the board columns.
export const STAGE_ORDER: OrderStage[] = [
  "received", "sourcing", "ready_to_ship", "shipped",
];
// Kanban columns: the workflow stages + the derived delivery stages + cancelled.
export const ALL_STAGES: OrderStage[] = [...STAGE_ORDER, "partially_delivered", "delivered", "cancelled"];
// Derived from per-line fulfilment — the operator can't set these manually (no drop / no advance).
export const DERIVED_STAGES: OrderStage[] = ["partially_delivered", "delivered"];
// Delivery draws stock, so it only opens once an order has reached "Ready to Ship" (or beyond).
export const DELIVERABLE_STAGES: OrderStage[] = ["ready_to_ship", "shipped", "partially_delivered"];
export const canDeliverAtStage = (s: OrderStage) => DELIVERABLE_STAGES.includes(s);
export const STAGE_LABEL: Record<OrderStage, string> = {
  received: "Received",
  processing: "Processing",
  sourcing: "Sourcing",
  ready_to_ship: "Ready to Ship",
  shipped: "Shipped",
  partially_delivered: "Partially Delivered",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function nextStage(s: OrderStage): OrderStage | null {
  const i = STAGE_ORDER.indexOf(s);
  if (i === -1 || i >= STAGE_ORDER.length - 1) return null; // delivered / cancelled / retired → none
  return STAGE_ORDER[i + 1];
}

// The board column an order belongs to — a retired/legacy stage (e.g. "processing") folds into the
// first column so no order is ever stranded off the board after a stage is removed from the flow.
export const columnStageOf = (s: OrderStage): OrderStage => (ALL_STAGES.includes(s) ? s : "received");

// Terminal / derived stages an order must NOT be manually dragged out of on the board: delivered &
// partially_delivered are set by per-line fulfilment (moving them would desync qty_delivered), and
// cancelled shouldn't be silently un-cancelled by a drag.
export const isTerminalStage = (s: OrderStage): boolean => DERIVED_STAGES.includes(s) || s === "cancelled";

// Realized cost of goods for an order: catalogue lines (via order_cogs / stock movements) +
// one-off lines (delivered units × their landed-cost snapshot). Zero until lines are delivered.
export function useOrderCosts(orderId: string | null) {
  return useQuery({
    queryKey: ["order-costs", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<{ cogs_pkr: number; replacement_cost_pkr: number }> => {
      if (!orderId) return { cogs_pkr: 0, replacement_cost_pkr: 0 };
      const [cat, oneoff, repl] = await Promise.all([
        supabase.from("order_cogs").select("cogs_pkr").eq("order_id", orderId),
        supabase.from("order_items").select("qty_delivered, landed_cost_pkr").eq("order_id", orderId).is("product_id", null),
        // An at-fault replacement re-ship draws kind='replacement', NOT 'sale' — so order_cogs
        // (sale-only) reports 0 and the order would read as having cost us nothing. It didn't:
        // the house bears the landed cost of the units sent out. Surfaced separately so it is
        // never confused with COGS against revenue — a replacement earns no revenue at all.
        supabase
          .from("stock_movements")
          .select("cogs_pkr_snap, order_items!inner(order_id)")
          .eq("kind", "replacement")
          .eq("order_items.order_id", orderId),
      ]);
      if (cat.error) throw new Error(friendlyError(cat.error));
      if (oneoff.error) throw new Error(friendlyError(oneoff.error));
      if (repl.error) throw new Error(friendlyError(repl.error));
      const catCogs = (cat.data ?? []).reduce((s, r) => s + Number(r.cogs_pkr ?? 0), 0);
      const ooCogs = (oneoff.data ?? []).reduce((s, r) => s + (r.qty_delivered ?? 0) * Number(r.landed_cost_pkr ?? 0), 0);
      const replCost = (repl.data ?? []).reduce((s, r) => s + Number(r.cogs_pkr_snap ?? 0), 0);
      return { cogs_pkr: catCogs + ooCogs, replacement_cost_pkr: replCost };
    },
  });
}

export interface OrderItem {
  id: string;
  product_id: string | null;
  name: string;
  sku: string | null;
  qty: number;
  // NET unit price (discount already applied) — this is what every margin/P&L view reads.
  price_pkr: number;
  // Display metadata mirrored from the invoice line: the gross price before the discount
  // (null when undiscounted) and the discount itself.
  list_price_pkr: number | null;
  discount_pct: number;
  discount_pkr: number;
  qty_delivered: number;
  oneoff_product_id: string | null;   // set for a one-off product line (no catalogue product)
  landed_cost_pkr: number | null;     // cost snapshot for a one-off line
}

// Derived per-line fulfilment status (qty_delivered is the truth).
export type LineStatus = "pending" | "partial" | "delivered";
export function lineStatus(qtyDelivered: number, qty: number): LineStatus {
  if (qtyDelivered >= qty) return "delivered";
  if (qtyDelivered > 0) return "partial";
  return "pending";
}
export interface OrderStageEvent {
  stage: OrderStage;
  at: string;
  actor: string | null;
}
export interface OrderRow {
  id: string;
  order_no: string | null;
  customer_id: string;
  stage: OrderStage;
  total_pkr: number;
  notes: string | null;
  created_at: string;
  customers: { name: string; city: string | null; email: string | null; phone: string | null; type: string } | null;
  order_items: OrderItem[];
  order_stage_events: OrderStageEvent[];
  replaces_order_id: string | null; // set when this order is an at-fault replacement re-ship
}

const ORDER_COLUMNS =
  "id, order_no, customer_id, stage, total_pkr, notes, created_at, replaces_order_id, " +
  "customers(name, city, email, phone, type), " +
  "order_items(id, product_id, name, sku, qty, price_pkr, list_price_pkr, discount_pct, discount_pkr, qty_delivered, oneoff_product_id, landed_cost_pkr), " +
  "order_stage_events(stage, at, actor)";

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as unknown as OrderRow[];
    },
  });
}

export const newCustomerDraftSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required"),
  type: z.enum(["retail", "trade", "workshop"]),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  city: z.string().trim().default(""),
});
export type NewCustomerDraft = z.infer<typeof newCustomerDraftSchema>;

export const orderItemSchema = z.object({
  // Catalogue lines carry a uuid; a one-off product line sends "" and carries name/cost/link instead.
  product_id: z.string(),
  qty: z
    .number({ invalid_type_error: "Quantity must be a number" })
    .int("Whole quantities only")
    .positive("Quantity must be at least 1"),
  // Per-line price override. Omitted → the RPC applies the customer-type tier (reseller for
  // trade/workshop, retail otherwise). The operator can override any line.
  price_pkr: z.number({ invalid_type_error: "Enter a price" }).finite().nonnegative("0 or more").optional(),
  // One-off product line fields (ignored for catalogue lines).
  name: z.string().optional(),
  // Carried so an EDIT round-trip doesn't blank a one-off line's OEM part no (update_order
  // deletes and re-inserts every line from this payload).
  sku: z.string().nullable().optional(),
  oneoff_product_id: z.string().uuid().nullable().optional(),
  landed_cost_pkr: z.number().finite().nonnegative().optional(),
});

export const createOrderSchema = z
  .object({
    customer_id: z.string().uuid().nullable(),
    new_customer: newCustomerDraftSchema.nullable(),
    items: z.array(orderItemSchema).min(1, "Add at least one item"),
    notes: z.string().nullable(),
  })
  .refine((v) => v.customer_id || v.new_customer, { message: "Choose or add a customer" });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const parsed = createOrderSchema.parse(input);
      // gen-types marks p_customer_id/p_notes non-nullable, but the function
      // accepts null (new-customer / no-notes); cast keeps Returns typing.
      const args = {
        p_customer_id: parsed.customer_id,
        p_new_customer: parsed.new_customer,
        p_items: parsed.items,
        p_notes: parsed.notes,
      } as unknown as Database["public"]["Functions"]["create_order"]["Args"];
      const { data, error } = await supabase.rpc("create_order", args);
      if (error) throw new Error(friendlyError(error));
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

// Edit an order's line items — only before any line is delivered (the RPC enforces this).
export const updateOrderSchema = z.object({
  id: z.string().uuid(),
  items: z.array(orderItemSchema).min(1, "Add at least one item"),
});
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrderInput) => {
      const parsed = updateOrderSchema.parse(input);
      const args = {
        p_id: parsed.id,
        p_items: parsed.items,
      } as unknown as Database["public"]["Functions"]["update_order"]["Args"];
      const { data, error } = await supabase.rpc("update_order", args);
      if (error) throw new Error(friendlyError(error));
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", v.id] });
    },
  });
}

export function useSetOrderStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: OrderStage }) => {
      const { error } = await supabase.from("orders").update({ stage }).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    // Manual stage is operator workflow only (received → shipped). Delivery — and the stock
    // draw-down — happens per-line via fulfil_order_line, which rolls the stage to
    // partially_delivered / delivered. Refresh products too (stock can change elsewhere).
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// Deliver some/all of a line — draws batch stock FIFO (server-authoritative RPC) and rolls
// the order up. Stock draws down, so refresh products.
export function useFulfilOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ line_id, qty }: { line_id: string; qty: number }) => {
      const { error } = await supabase.rpc("fulfil_order_line", { p_line_id: line_id, p_qty: qty });
      if (error) throw new Error(friendlyError(error));
    },
    // A fulfilment records a SALE — it moves stock AND the money (COGS, margins, the investor
    // accrual, the P&L). Refresh everything a sale derives, or the investor settlement /
    // dashboard profit stay stale until a manual reload.
    onSuccess: () => {
      // order-costs is the ONLY reader of realized COGS, and fulfilment is the only event that
      // creates it — without this the order's "Cost of goods"/"Gross profit" tiles stay at the
      // pre-delivery figures until a hard reload.
      for (const key of [["orders"], ["order-costs"], ["products"], ["pnl-summary"], ["investor-owed"],
                         ["investor-product-pnl"], ["product-sales-pnl"], ["category_sales"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateOrderNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("orders").update({ notes: notes.trim() || null }).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
