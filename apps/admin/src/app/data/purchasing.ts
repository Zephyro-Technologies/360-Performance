// Purchasing data layer — Purchase Orders, lines, receiving, payables. The PO carries
// the client-typed frozen RMB->PKR rate; receiving goes through the receive_po_line RPC
// (freezes the batch landed cost). Server-authoritative; invalidate-on-success refetch.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@360/supabase";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export type POStatus = Database["public"]["Enums"]["po_status"];

export const PO_STATUS_FLOW: POStatus[] = ["planning", "approved", "ordered", "in_production", "in_transit", "received"];
export const PO_STATUS_LABEL: Record<POStatus, string> = {
  planning: "Planning",
  approved: "Approved",
  ordered: "Ordered",
  in_production: "In Production",
  in_transit: "In Transit",
  received: "Received",
  cancelled: "Cancelled",
};

export interface PurchaseOrderListRow {
  id: string;
  po_no: string | null;
  supplier_id: string;
  status: POStatus;
  frozen_rate_rmb_pkr: number | null;
  ordered_on: string | null;
  expected_on: string | null;
  received_on: string | null;
  created_at: string;
  suppliers: { name: string } | null;
  line_count: number;
  category_ids: string[]; // distinct leaf-category ids of this PO's line products (for the board category filter)
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async (): Promise<PurchaseOrderListRow[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_no, supplier_id, status, frozen_rate_rmb_pkr, ordered_on, expected_on, received_on, created_at, suppliers(name), purchase_order_lines(products(category_id))")
        .order("created_at", { ascending: false });
      if (error) throw new Error(friendlyError(error));
      return ((data ?? []) as unknown as (Omit<PurchaseOrderListRow, "line_count" | "category_ids"> & { purchase_order_lines: { products: { category_id: string | null } | null }[] })[]).map((r) => {
        const lines = r.purchase_order_lines ?? [];
        return {
          ...r,
          line_count: lines.length,
          category_ids: [...new Set(lines.map((l) => l.products?.category_id).filter((c): c is string => !!c))],
        };
      });
    },
  });
}

export interface POLine {
  id: string;
  product_id: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost_rmb: number;
  shipping_per_unit_pkr: number;
  packaging_per_unit_pkr: number;
  item_paid_amount_pkr: number | null;
  item_paid_on: string | null;
  item_credit_added_pkr: number;
  item_paid_from_credit: boolean;
  ship_paid_amount_pkr: number | null;
  ship_paid_on: string | null;
  ship_paid_from_credit: boolean;
  freight_vendor_id: string | null; // per-line air/sea vendor override (null = use the PO's)
  products: { name: string; sku: string } | null;
}
export interface PurchaseOrderDetail {
  id: string;
  po_no: string | null;
  supplier_id: string;
  status: POStatus;
  frozen_rate_rmb_pkr: number | null;
  ordered_on: string | null;
  expected_on: string | null;
  received_on: string | null;
  notes: string | null;
  freight_vendor_id: string | null; // the PO's default air/sea (logistics) vendor
  suppliers: { name: string; currency: string } | null;
  purchase_order_lines: POLine[];
}

// Derived landed cost for a line, given the PO's frozen rate (item RMB×rate + ship + pkg).
export function lineLanded(line: POLine, rate: number | null): { unitPkr: number; landedPerUnit: number; landedTotal: number } {
  const unitPkr = line.unit_cost_rmb * (rate ?? 0);
  const landedPerUnit = unitPkr + line.shipping_per_unit_pkr + line.packaging_per_unit_pkr;
  return { unitPkr, landedPerUnit, landedTotal: landedPerUnit * line.qty_ordered };
}

// The single source of a PO line's PAYABLES arithmetic — item + shipping cost/paid/due, rounding
// each component exactly like the server `vendor_payables` view. Used by usePODues, the PO detail
// summary, and the "Pay full balance" action, so those can never drift apart. (Distinct from
// lineLanded, which is COGS: it includes packaging and is per-unit, not a payable.)
export interface LineDues { itemCost: number; shipCost: number; itemDue: number; shipDue: number; cost: number; paid: number; due: number; credit: number }
export function lineDues(
  l: { qty_ordered: number; unit_cost_rmb: number; shipping_per_unit_pkr: number; item_paid_amount_pkr: number | null; ship_paid_amount_pkr: number | null; item_credit_added_pkr?: number | null },
  rate: number | null,
): LineDues {
  const itemCost = Math.round(l.qty_ordered * Number(l.unit_cost_rmb) * (rate ?? 0));
  const shipCost = Math.round(l.qty_ordered * Number(l.shipping_per_unit_pkr));
  const itemPaid = Number(l.item_paid_amount_pkr ?? 0);
  const shipPaid = Number(l.ship_paid_amount_pkr ?? 0);
  const itemDue = Math.max(0, itemCost - itemPaid);
  const shipDue = Math.max(0, shipCost - shipPaid);
  return {
    itemCost, shipCost, itemDue, shipDue,
    cost: itemCost + shipCost,
    paid: Math.min(itemPaid, itemCost) + Math.min(shipPaid, shipCost),
    due: itemDue + shipDue,
    credit: Number(l.item_credit_added_pkr ?? 0),
  };
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["purchase-order", id],
    enabled: !!id,
    queryFn: async (): Promise<PurchaseOrderDetail> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          "id, po_no, supplier_id, status, frozen_rate_rmb_pkr, ordered_on, expected_on, received_on, notes, freight_vendor_id, " +
            "suppliers(name, currency), " +
            "purchase_order_lines(id, product_id, qty_ordered, qty_received, unit_cost_rmb, shipping_per_unit_pkr, packaging_per_unit_pkr, item_paid_amount_pkr, item_paid_on, item_credit_added_pkr, item_paid_from_credit, ship_paid_amount_pkr, ship_paid_on, ship_paid_from_credit, freight_vendor_id, products(name, sku))",
        )
        .eq("id", id!)
        .single();
      if (error) throw new Error(friendlyError(error));
      return data as unknown as PurchaseOrderDetail;
    },
  });
}

function invalidatePO(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ["purchase-orders"] });
  if (id) qc.invalidateQueries({ queryKey: ["purchase-order", id] });
  // receiving changes derived stock/cost/payables
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["vendor-payables"] });
  qc.invalidateQueries({ queryKey: ["owed-by-supplier"] });
  qc.invalidateQueries({ queryKey: ["purchase-payments"] });
  qc.invalidateQueries({ queryKey: ["po-dues"] });
  // the Investor / In-House catalogue tables read these — paid amounts, received qty, landed cost all move
  qc.invalidateQueries({ queryKey: ["product-pnl"] });
  qc.invalidateQueries({ queryKey: ["purchase-line-detail"] });
}

// Per committed PO: total cost, amount paid, and amount still due — for the order-level payment
// status (Done / Partial / Pending) in Purchasing → Payments.
export interface PODue {
  purchase_order_id: string;
  po_no: string | null;
  supplier_id: string;
  cost: number;
  paid: number;
  due: number;
  credit: number; // extra credit banked from over-paying items on this order
}
export function usePODues() {
  return useQuery({
    queryKey: ["po-dues"],
    queryFn: async (): Promise<PODue[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_no, supplier_id, status, frozen_rate_rmb_pkr, purchase_order_lines(qty_ordered, unit_cost_rmb, shipping_per_unit_pkr, item_paid_amount_pkr, ship_paid_amount_pkr, item_credit_added_pkr)");
      if (error) throw new Error(friendlyError(error));
      const active = new Set(["ordered", "in_production", "in_transit", "received"]);
      const out: PODue[] = [];
      for (const po of (data ?? []) as unknown as { id: string; po_no: string | null; supplier_id: string; status: string; frozen_rate_rmb_pkr: number | null; purchase_order_lines: { qty_ordered: number; unit_cost_rmb: number; shipping_per_unit_pkr: number; item_paid_amount_pkr: number | null; ship_paid_amount_pkr: number | null; item_credit_added_pkr: number | null }[] }[]) {
        if (!active.has(po.status)) continue;
        const rate = po.frozen_rate_rmb_pkr;
        let cost = 0, paid = 0, due = 0, credit = 0;
        for (const l of po.purchase_order_lines ?? []) {
          const d = lineDues(l, rate);
          cost += d.cost; paid += d.paid; due += d.due; credit += d.credit;
        }
        if (cost > 0) out.push({ purchase_order_id: po.id, po_no: po.po_no, supplier_id: po.supplier_id, cost, paid, due, credit });
      }
      return out;
    },
  });
}

// Every payment made against an order — each line's item and shipping payment is its own entry
// (with its own date), so the same PO across different dates shows as separate rows.
export interface PurchasePayment {
  key: string;
  paid_on: string;
  po_no: string | null;
  purchase_order_id: string | null;
  vendor: string | null;
  kind: "Items" | "Shipping";
  amount_pkr: number;
  from_credit: boolean;
  extra_credit_pkr: number; // over-payment on items banked as vendor credit (0 for shipping)
}
export function usePurchasePayments() {
  return useQuery({
    queryKey: ["purchase-payments"],
    queryFn: async (): Promise<PurchasePayment[]> => {
      const { data, error } = await supabase
        .from("purchase_order_lines")
        .select("id, item_paid_amount_pkr, item_paid_on, item_paid_from_credit, item_credit_added_pkr, ship_paid_amount_pkr, ship_paid_on, ship_paid_from_credit, purchase_order_id, purchase_orders(po_no, suppliers(name))");
      if (error) throw new Error(friendlyError(error));
      const out: PurchasePayment[] = [];
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const po = row.purchase_orders as { po_no: string | null; suppliers: { name: string } | null } | null;
        const po_no = po?.po_no ?? null;
        const vendor = po?.suppliers?.name ?? null;
        const poId = (row.purchase_order_id as string | null) ?? null;
        const id = row.id as string;
        if (row.item_paid_on) out.push({ key: `${id}-item`, paid_on: row.item_paid_on as string, po_no, purchase_order_id: poId, vendor, kind: "Items", amount_pkr: Number(row.item_paid_amount_pkr ?? 0), from_credit: !!row.item_paid_from_credit, extra_credit_pkr: Number(row.item_credit_added_pkr ?? 0) });
        if (row.ship_paid_on) out.push({ key: `${id}-ship`, paid_on: row.ship_paid_on as string, po_no, purchase_order_id: poId, vendor, kind: "Shipping", amount_pkr: Number(row.ship_paid_amount_pkr ?? 0), from_credit: !!row.ship_paid_from_credit, extra_credit_pkr: 0 });
      }
      out.sort((a, b) => (a.paid_on < b.paid_on ? 1 : a.paid_on > b.paid_on ? -1 : 0));
      return out;
    },
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { supplier_id: string; status?: POStatus; frozen_rate_rmb_pkr?: number | null; ordered_on?: string | null; expected_on?: string | null; notes?: string | null; freight_vendor_id?: string | null }): Promise<string> => {
      const { data, error } = await supabase.from("purchase_orders").insert(input).select("id").single();
      if (error) throw new Error(friendlyError(error));
      return data!.id;
    },
    onSuccess: () => invalidatePO(qc),
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<{ status: POStatus; frozen_rate_rmb_pkr: number | null; ordered_on: string | null; expected_on: string | null; notes: string | null; freight_vendor_id: string | null }>) => {
      const { error } = await supabase.from("purchase_orders").update(patch).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: (_d, vars) => invalidatePO(qc, vars.id),
  });
}

export function useAddPOLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { purchase_order_id: string; product_id: string; qty_ordered: number; unit_cost_rmb: number; shipping_per_unit_pkr: number; packaging_per_unit_pkr: number; freight_vendor_id?: string | null }) => {
      const { error } = await supabase.from("purchase_order_lines").insert(input);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: (_d, vars) => invalidatePO(qc, vars.purchase_order_id),
  });
}

export function useUpdatePOLine(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<{ item_paid_amount_pkr: number | null; item_paid_on: string | null; ship_paid_amount_pkr: number | null; ship_paid_on: string | null; item_paid_from_credit: boolean; ship_paid_from_credit: boolean; item_credit_added_pkr: number; freight_vendor_id: string | null }>) => {
      const { error } = await supabase.from("purchase_order_lines").update(patch).eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidatePO(qc, poId),
  });
}

// Atomic line payment via the record_po_payment RPC: the vendor-advance ledger entry + the line
// update happen in one transaction (a rejected draw-down rolls both back), and the line cost is
// computed server-side exactly like vendor_payables (no rounding drift).
export function useRecordPOPayment(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { line_id: string; kind: "item" | "ship"; amount_pkr: number; use_credit: boolean; occurred_on: string | null }) => {
      const { error } = await supabase.rpc("record_po_payment", { p_line_id: v.line_id, p_kind: v.kind, p_amount: v.amount_pkr, p_use_credit: v.use_credit, p_occurred_on: v.occurred_on || undefined } as unknown as Database["public"]["Functions"]["record_po_payment"]["Args"]);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => {
      invalidatePO(qc, poId);
      qc.invalidateQueries({ queryKey: ["vendor-advance-balances"] });
      qc.invalidateQueries({ queryKey: ["vendor-advance-ledger"] });
    },
  });
}

export function useDeletePOLine(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_order_lines").delete().eq("id", id);
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidatePO(qc, poId),
  });
}

export function useReceivePOLine(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ line_id, qty, received_on }: { line_id: string; qty: number; received_on?: string }) => {
      const { error } = await supabase.rpc("receive_po_line", { p_line_id: line_id, p_qty: qty, p_received_on: received_on });
      if (error) throw new Error(friendlyError(error));
    },
    onSuccess: () => invalidatePO(qc, poId),
  });
}

export interface VendorPayable {
  supplier_id: string;
  name: string;
  item_owed_pkr: number;
  ship_owed_pkr: number;
}
export function useVendorPayables() {
  return useQuery({
    queryKey: ["vendor-payables"],
    queryFn: async (): Promise<VendorPayable[]> => {
      const { data, error } = await supabase.from("vendor_payables").select("supplier_id, name, item_owed_pkr, ship_owed_pkr").order("name");
      if (error) throw new Error(friendlyError(error));
      return (data ?? []).map((r) => ({
        supplier_id: r.supplier_id as string,
        name: r.name as string,
        item_owed_pkr: Number(r.item_owed_pkr ?? 0),
        ship_owed_pkr: Number(r.ship_owed_pkr ?? 0),
      }));
    },
  });
}

// Per-supplier accounts payable (item + shipping owed, from vendor_payables). Supplier PAYMENTS
// and CREDIT are unified into the vendor-advance ledger (see data/vendorAdvances.ts) — a payment
// is a top-up to the supplier's vendor account, so overpayment shows up as credit there.
export type OwedBySupplier = Record<string, number>;
export function useOwedBySupplier() {
  return useQuery({
    queryKey: ["owed-by-supplier"],
    queryFn: async (): Promise<OwedBySupplier> => {
      const { data, error } = await supabase.from("vendor_payables").select("supplier_id, item_owed_pkr, ship_owed_pkr");
      if (error) throw new Error(friendlyError(error));
      const out: OwedBySupplier = {};
      for (const r of data ?? []) out[r.supplier_id as string] = Number(r.item_owed_pkr ?? 0) + Number(r.ship_owed_pkr ?? 0);
      return out;
    },
  });
}
