import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { FileUp, Pencil, Printer, Trash2 } from "lucide-react";
import { docFilename, printWithFilename, shipModeLabel } from "./printDoc";
import { QuotationEditDialog } from "./QuotationEditDialog";
import { formatDate, formatPKR } from "@360/lib/format";
import { Button } from "@360/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@360/ui/dialog";
import type { QuotationRecord } from "../../data/quotations";

function QuoteDoc({ quote }: { quote: QuotationRecord }) {
  return (
    <div
      id="quotation-doc"
      className="rounded-md border border-border"
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <div className="flex items-start justify-between bg-black p-6 text-white">
        <div>
          <img src="/logo.svg" alt="360 Performance" className="h-7 w-auto" />
          <p className="mt-2 text-xs text-white/60">Motorsports Parts · Islamabad</p>
        </div>
        <div className="text-right">
          <p className="[font-family:var(--font-heading)] text-lg font-bold text-[#cc0000]">QUOTATION</p>
          <p className="text-sm">{quote.quote_no}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-border p-6 text-sm">
        <div>
          <p className="text-sm uppercase text-muted-foreground [font-family:var(--font-heading)]">Customer</p>
          <p className="mt-1 font-medium">{quote.customer.name}</p>
          <p className="text-muted-foreground">{quote.customer.email}</p>
          <p className="text-muted-foreground">{quote.customer.phone}</p>
          <p className="text-muted-foreground">{quote.customer.city}</p>
        </div>
        <div className="text-right">
          <p><span className="text-muted-foreground">Issued: </span>{formatDate(quote.issue_date)}</p>
          {quote.order_no && <p className="mt-1"><span className="text-muted-foreground">Linked order: </span>{quote.order_no}</p>}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-black text-left text-white">
            <th className="p-3 [font-family:var(--font-heading)] font-semibold uppercase">Item</th>
            <th className="p-3 [font-family:var(--font-heading)] font-semibold uppercase">Brand</th>
            <th className="p-3 text-center [font-family:var(--font-heading)] font-semibold uppercase">Qty</th>
            <th className="p-3 text-right [font-family:var(--font-heading)] font-semibold uppercase">Price</th>
            <th className="p-3 text-right [font-family:var(--font-heading)] font-semibold uppercase">Amount</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((it, index) => (
            <tr key={`${it.product_id}-${index}`} className="border-b border-border">
              <td className="p-3">
                <div>{it.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{it.sku ?? "—"}</div>
              </td>
              <td className="p-3 text-muted-foreground">{it.brand ?? "—"}</td>
              <td className="p-3 text-center tabular-nums">{it.qty}</td>
              <td className="p-3 text-right tabular-nums">{formatPKR(it.price_pkr)}</td>
              <td className="p-3 text-right tabular-nums">{formatPKR(it.price_pkr * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col items-end gap-1 p-6 text-sm">
        <div className="flex w-56 justify-between font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatPKR(quote.total_pkr)}</span>
        </div>
      </div>

      {quote.notes && (
        <div className="border-t border-border p-6 text-sm">
          <p className="text-sm uppercase text-muted-foreground [font-family:var(--font-heading)]">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-foreground">{quote.notes}</p>
        </div>
      )}

      {/* Terms — a quotation is an ESTIMATE, not a demand for money. The wording makes clear
          it isn't the final bill: prices/availability can change until it's confirmed as an invoice. */}
      <div className="mx-6 mb-6 rounded-md border border-border px-4 py-3 text-xs leading-snug text-foreground">
        <p className="mb-1 [font-family:var(--font-heading)] uppercase tracking-wide">Terms &amp; Conditions</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>This is a quotation, not the final invoice. Prices and availability are estimates and may change.</li>
          <li>Payment terms: 100% advance. The order is confirmed once an invoice is raised and paid in full.</li>
          <li>Delivery: local 2–3 days | by air 12–15 days | by sea 60–80 days (from confirmation).</li>
          <li>All amounts in PKR. Computer-generated quotation, valid without signature.</li>
        </ul>
      </div>

      <div className="invoice-print-footer">
        <span>360 Performance · Motorsports Parts · Islamabad, Pakistan · {quote.quote_no}</span>
        <span className="page-num">Page 1</span>
      </div>
    </div>
  );
}

export function QuotationDetailDialog({
  quote,
  open,
  onOpenChange,
  onDelete,
  onPromote,
  promoting,
  canPromote,
  canEdit,
}: {
  quote: QuotationRecord | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  // Optional: omitted where the quote is opened read-only (e.g. from an order's detail), which
  // hides Delete / Promote — those belong on the Sales Documents screen that owns the list.
  onDelete?: (id: string) => void;
  onPromote?: (quote: QuotationRecord) => void;
  promoting?: boolean;
  canPromote?: boolean;
  canEdit: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl print:max-w-full print:border-0 print:shadow-none">
          <DialogHeader className="print:hidden">
            <DialogTitle>{quote?.quote_no ?? "Quotation"}</DialogTitle>
            <DialogDescription>{quote ? `Quotation for ${quote.customer.name}` : "Loading…"}</DialogDescription>
          </DialogHeader>

          {!quote ? (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          ) : (
            <>
              <QuoteDoc quote={quote} />

              {quote.order_id && quote.order_no && (
                <Link to={`/orders?order=${quote.order_id}`} className="inline-flex items-center gap-1 text-sm text-[#cc0000] hover:underline print:hidden">
                  From order {quote.order_no}
                </Link>
              )}

              <DialogFooter className="print:hidden">
                {onDelete && (
                  <div className="mr-auto flex items-center gap-2">
                    <Button variant="outline" onClick={() => onDelete(quote.id)}>
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  </div>
                )}
                {canEdit && (
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                )}
                <Button variant="outline" onClick={() => printWithFilename(docFilename({
                  client: quote.customer.name,
                  kind: "Quotation",
                  mode: shipModeLabel(quote.items.map((it) => it.shipping_type)),
                }))}>
                  <Printer className="size-4" /> Print / PDF
                </Button>
                {canPromote && onPromote && (
                  <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => onPromote(quote)} disabled={promoting}>
                    <FileUp className="size-4" /> {promoting ? "Promoting…" : "Promote to invoice"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {open && quote && createPortal(
        <div className="invoice-print-mount">
          <QuoteDoc quote={quote} />
        </div>,
        document.body,
      )}
      {quote && <QuotationEditDialog quote={quote} open={editOpen} onOpenChange={setEditOpen} />}
    </>
  );
}
