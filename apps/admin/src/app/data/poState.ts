// Unified purchase-order state — the single source of truth for how a PO "reads" at a glance.
// A PO carries two independent tracks: where the GOODS are (po_status) and where the MONEY is
// (derived from the line payables). This module owns the tone maps for both plus the board
// grouping and ETA helpers, so the board, the table, and the detail page all agree.
import type { POStatus } from "./purchasing";
import { PO_STATUS_LABEL } from "./purchasing";
import { businessTodayISO } from "./analytics";

export { PO_STATUS_LABEL };
export type { POStatus };

// ---- Goods track (po_status) -------------------------------------------------
// Moved here from Purchasing.tsx so there is ONE definition (it used to live in two files).
export const PO_STATUS_TONE: Record<POStatus, string> = {
  planning: "border-border bg-muted text-muted-foreground",
  approved: "border-sky-200 bg-sky-50 text-sky-700",
  ordered: "border-indigo-200 bg-indigo-50 text-indigo-700",
  in_production: "border-amber-200 bg-amber-50 text-amber-700",
  in_transit: "border-violet-200 bg-violet-50 text-violet-700",
  received: "border-green-200 bg-green-50 text-green-700",
  cancelled: "border-border bg-muted text-muted-foreground line-through",
};

// ---- Money track (derived) ---------------------------------------------------
export type PaymentStatus = "paid" | "partial" | "unpaid";
export const PAYMENT_LABEL: Record<PaymentStatus, string> = { paid: "Paid", partial: "Partial", unpaid: "Owed" };
export const PAYMENT_TONE: Record<PaymentStatus, string> = {
  paid: "border-green-200 bg-green-50 text-green-700",
  partial: "border-blue-200 bg-blue-50 text-blue-700",
  unpaid: "border-amber-200 bg-amber-50 text-amber-700",
};

// A PO's money status from its dues (cost / paid / due). "paid" when nothing is outstanding,
// "partial" once any money has gone out, "unpaid" before the first payment.
export function paymentStatusOf(d: { cost: number; paid: number; due: number }): PaymentStatus {
  if (d.due <= 0) return "paid";
  if (d.paid > 0) return "partial";
  return "unpaid";
}

// ---- Board grouping ----------------------------------------------------------
// The lanes the pipeline board reads left-to-right — a 1:1 mirror of the po_status dropdown on
// the PO detail page, so the board and the dropdown can never tell different stories. Cancelled
// POs are not boarded.
//
// There is no separate wishlist lane: planned_purchases (items wanted before a vendor is chosen,
// which therefore cannot be POs — purchase_orders.supplier_id is NOT NULL) are shown as cards
// inside the Planning lane, alongside real planning-stage POs.
export type BoardLane =
  | "planning" | "approved" | "ordered" | "production" | "transit" | "arrived";
export const BOARD_LANES: { key: BoardLane; label: string }[] = [
  { key: "planning", label: "Planning" },
  { key: "approved", label: "Approved" },
  { key: "ordered", label: "Ordered" },
  { key: "production", label: "In production" },
  { key: "transit", label: "In transit" },
  { key: "arrived", label: "Arrived" },
];

// Which lane a real PO sits in — one lane per status, matching the dropdown. Cancelled is
// excluded from the board.
export function boardLaneOf(status: POStatus): BoardLane | null {
  switch (status) {
    case "planning":
      return "planning";
    case "approved":
      return "approved";
    case "ordered":
      return "ordered";
    case "in_production":
      return "production";
    case "in_transit":
      return "transit";
    case "received":
      return "arrived";
    case "cancelled":
      return null;
  }
}

// ---- ETA (arrival countdown) -------------------------------------------------
// Whole-day difference from the Pakistan business day to a plain `date` column — the same day
// notion the rest of the app uses, so "arrives today" / overdue never drift on a browser set to
// another timezone.
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${businessTodayISO()}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

// A short arrival label + whether it's overdue, for in-transit cards.
export function etaLabel(iso: string | null | undefined): { text: string; overdue: boolean } | null {
  const d = daysUntil(iso);
  if (d == null) return null;
  if (d < 0) return { text: `${-d}d overdue`, overdue: true };
  if (d === 0) return { text: "arrives today", overdue: false };
  if (d === 1) return { text: "1 day left", overdue: false };
  return { text: `${d} days left`, overdue: false };
}
