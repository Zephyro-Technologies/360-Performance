// The two badges that express a purchase order's state. StatusBadge = where the goods are
// (po_status); PaymentBadge = where the money is (derived). Kept together so both tracks share
// one visual language and one import site (previously the goods pill was duplicated in two files).
import { cn } from "@360/ui/utils";
import { PO_STATUS_LABEL, type POStatus } from "../../data/purchasing";
import { PO_STATUS_TONE, PAYMENT_LABEL, PAYMENT_TONE, type PaymentStatus } from "../../data/poState";

const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

export function StatusBadge({ status, className }: { status: POStatus; className?: string }) {
  return <span className={cn(base, PO_STATUS_TONE[status], className)}>{PO_STATUS_LABEL[status]}</span>;
}

export function PaymentBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  return <span className={cn(base, PAYMENT_TONE[status], className)}>{PAYMENT_LABEL[status]}</span>;
}
