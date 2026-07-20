// Invoice detail: branded printable doc + payment ledger. Record a payment
// (staff/admin), reverse one (admin), or void the invoice (when unpaid). Balance
// and status come from the invoice_balances view (net of reversals).
import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { Ban, FileUp, KanbanSquare, Pencil, Printer, Plus, Undo2 } from "lucide-react";
import { docFilename, printWithFilename, shipModeLabel } from "./printDoc";
import { toast } from "sonner";
import { z } from "zod";
import {
  useInvoice,
  useRecordPayment,
  useReversePayment,
  useVoidInvoice,
  useLinkInvoiceOrder,
  type InvoiceDetailRow,
  type InvoicePayment,
  type PaymentMethod,
} from "../../data/invoices";
import { useSettings, type BankDetails } from "../../data/settings";
import { InvoiceEditDialog } from "./InvoiceEditDialog";
import { QuotationDetailDialog } from "./QuotationDetailDialog";
import { useQuotation } from "../../data/quotations";
import { useAuth } from "../../data/auth";
import { formatPKR, formatDate } from "@360/lib/format";
import { StatusBadge } from "../common/StatusBadge";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@360/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "other", label: "Other" },
];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS.map((m) => [m.value, m.label]));
const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", partial: "Partial", unpaid: "Unpaid", overdue: "Overdue", void: "Void",
};

// The branded invoice document + terms + footer. Rendered on screen inside the dialog and,
// for printing, into a copy portaled onto <body> (see InvoiceDetail / theme.css @media print).
function InvoiceDoc({
  invoice,
  customer,
  paid,
  balance,
  bank,
}: {
  invoice: InvoiceDetailRow;
  customer: InvoiceDetailRow["customers"];
  paid: number;
  balance: number;
  bank: BankDetails | null;
}) {
  // The customer-facing document deliberately shows NO discount breakdown — line prices and the
  // subtotal are rendered net, so it reads as a plain invoice at the agreed price. The discount
  // is internal and stays on the order board / edit dialog.

  // Every bank field is optional: print only what is filled, and drop the whole block if
  // none of it is set, rather than showing empty labels on a customer-facing document.
  const bankRows = [
    { label: "Bank", value: bank?.bank_name, numeric: false },
    { label: "Account Title", value: bank?.account_title, numeric: false },
    { label: "IBAN", value: bank?.iban, numeric: true },
  ].filter((r) => r.value);

  return (
    <>
      {/* print-color-adjust (inherited) forces the branded black header + white logo
          to actually render in print / PDF. */}
      <div
        id="invoice-doc"
        className="rounded-md border border-border"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        <div className="flex items-start justify-between bg-black p-6 text-white">
          <div>
            <img src="/logo.svg" alt="360 Performance" className="h-7 w-auto" />
            <p className="mt-2 text-xs text-white/60">Motorsports Parts · Islamabad</p>
          </div>
          <div className="text-right">
            <p className="[font-family:var(--font-heading)] text-lg font-bold text-[#cc0000]">INVOICE</p>
            <p className="text-sm">{invoice.invoice_no}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-border p-6 text-sm">
          <div>
            <p className="text-sm uppercase text-muted-foreground [font-family:var(--font-heading)]">Billed To</p>
            <p className="mt-1 font-medium">{customer?.name}</p>
            <p className="text-muted-foreground">{customer?.email}</p>
            <p className="text-muted-foreground">{customer?.city}</p>
          </div>
          {/* No due date: terms are 100% advance, so there is nothing to fall due. */}
          <div className="text-right">
            <p><span className="text-muted-foreground">Issued: </span>{formatDate(invoice.issue_date)}</p>
          </div>
        </div>

        {/* Payment details — sits between the header block and the line items, separated
            from both by the same thin 1px border the other sections use. */}
        {bankRows.length > 0 && (
          <div className="border-b border-border p-6 text-sm">
            <p className="text-sm uppercase text-muted-foreground [font-family:var(--font-heading)]">Payment Details</p>
            {/* Label ABOVE value, not inline: the labels differ in width ("Bank" vs "Account
                Title"), so an inline "Label: value" left the three values starting at three
                different x-positions. Stacked, every column is left-aligned and each value
                sits flush with its own label.

                Columns are auto/auto/1fr rather than three equal thirds: an IBAN is ~24 chars
                and wrapped onto a second line when boxed into a third of the width. Bank and
                Account Title now take only the width they need and the IBAN gets the remainder,
                so it stays on one line. */}
            <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[auto_auto_1fr]">
              {bankRows.map((r) => (
                <div key={r.label} className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</p>
                  <p
                    className={
                      "mt-0.5 font-medium" +
                      (r.numeric ? " whitespace-nowrap tabular-nums" : " break-words")
                    }
                  >
                    {r.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

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
            {invoice.invoice_items.map((it) => (
              <tr key={it.id} className="border-b border-border">
                <td className="p-3">{it.name}</td>
                <td className="p-3 text-muted-foreground">{it.brand ?? "—"}</td>
                <td className="p-3 text-center tabular-nums">{it.qty}</td>
                {/* NET unit price. The customer-facing document never mentions the discount, so
                    it must show the discounted price itself — printing the gross price beside a
                    discounted Amount would simply look like an arithmetic error. */}
                <td className="p-3 text-right tabular-nums">
                  {formatPKR((it.price_pkr * it.qty - it.discount_pkr) / it.qty)}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {formatPKR(it.price_pkr * it.qty - it.discount_pkr)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col items-end gap-1 p-6 text-sm">
          {/* Subtotal NET of the discount, so Subtotal + Tax = Total still holds. */}
          <div className="flex w-56 justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatPKR(invoice.subtotal_pkr - invoice.discount_pkr)}</span></div>
          <div className="flex w-56 justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{formatPKR(invoice.tax_pkr)}</span></div>
          <div className="flex w-56 justify-between font-medium"><span>Total</span><span className="tabular-nums">{formatPKR(invoice.total_pkr)}</span></div>
          <div className="flex w-56 justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums">{formatPKR(paid)}</span></div>
          <div className="mt-1 flex w-56 justify-between border-t-2 border-[#cc0000] pt-2">
            <span className="[font-family:var(--font-heading)] font-bold uppercase">Balance</span>
            <span className="[font-family:var(--font-heading)] font-bold tabular-nums text-[#cc0000]">{formatPKR(balance)}</span>
          </div>
        </div>
      </div>

      {/* Terms — the client's actual trading terms. Shown on screen AND in print.
          The three delivery windows share one row, pipe-separated. Single uniform
          colour — no per-phrase emphasis spans. */}
      <div className="mt-3 rounded-md border border-border px-4 py-3 text-xs leading-snug text-foreground">
        <p className="mb-1 [font-family:var(--font-heading)] uppercase tracking-wide">Terms &amp; Conditions</p>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>Payment: 100% advance. Orders are processed once payment is received in full.</li>
          <li>Delivery: local 2–3 days | by air 12–15 days | by sea 60–80 days.</li>
          <li>Quote the invoice number when paying. All amounts in PKR.</li>
          <li>Computer-generated invoice, valid without signature.</li>
        </ul>
      </div>

      {/* Brand footer + page number — prints at the foot of every page. */}
      <div className="invoice-print-footer">
        <span>360 Performance · Motorsports Parts · Islamabad, Pakistan · {invoice.invoice_no}</span>
        <span className="page-num">Page 1</span>
      </div>
    </>
  );
}

export function InvoiceDetail({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const invQ = useInvoice(invoiceId);
  const settingsQ = useSettings();
  const record = useRecordPayment();
  const reverse = useReversePayment();
  const voidInvoice = useVoidInvoice();
  const linkOrder = useLinkInvoiceOrder();
  const { can } = useAuth();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [viewQuote, setViewQuote] = useState<string | null>(null); // source quotation, opened in place
  const sourceQuoteQ = useQuotation(viewQuote);

  const invoice = invQ.data ?? null;
  const customer = invoice?.customers ?? null;
  const paid = invoice?.balance?.paid_pkr ?? 0;
  const balance = invoice?.balance?.balance_pkr ?? 0;
  const status = invoice?.balance?.status ?? "unpaid";
  const bank = settingsQ.data ?? null;
  // Mirrors the update_invoice RPC exactly: admin, not voided, and NO payment rows at all
  // (a reversal is still a payment row — reverse-then-edit must leave the ledger empty).
  const canEdit = can("manage") && status !== "void" && (invoice?.payments.length ?? 0) === 0;
  const reversedIds = new Set(
    (invoice?.payments ?? []).filter((p) => p.kind === "reversal").map((p) => p.reverses_payment_id),
  );

  async function recordPayment() {
    if (!invoice) return;
    try {
      await record.mutateAsync({ invoice_id: invoice.id, amount_pkr: Number(amount), method });
      setAmount("");
      setAdding(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Check the amount.");
      else toast.error(e instanceof Error ? e.message : "Could not record payment.");
    }
  }

  async function reversePayment(p: InvoicePayment) {
    if (!invoice || !confirm(`Reverse this ${formatPKR(p.amount_pkr)} payment?`)) return;
    try {
      await reverse.mutateAsync({ invoice_id: invoice.id, payment_id: p.id, amount_pkr: p.amount_pkr, method: p.method });
      toast.success("Payment reversed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reverse payment.");
    }
  }

  async function doVoid() {
    if (!invoice || !confirm("Void this invoice? It will be marked void.")) return;
    try {
      await voidInvoice.mutateAsync(invoice.id);
      toast.success("Invoice voided");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not void invoice.");
    }
  }

  async function startPipeline() {
    if (!invoice) return;
    try {
      const order = await linkOrder.mutateAsync(invoice.id);
      toast.success(`Added to the order pipeline${order?.order_no ? ` as ${order.order_no}` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the order pipeline.");
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl print:max-w-full print:border-0 print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-3">
            {invoice?.invoice_no ?? "Invoice"}
            {invoice && <StatusBadge status={STATUS_LABEL[status] ?? status} />}
          </DialogTitle>
          <DialogDescription>{customer ? `Invoice for ${customer.name}` : "Loading…"}</DialogDescription>
        </DialogHeader>

        {!invoice ? (
          <div className="py-12 text-center text-muted-foreground">Loading…</div>
        ) : (
          <>
            {/* On-screen copy (the print copy is portaled onto <body>, below). */}
            <InvoiceDoc invoice={invoice} customer={customer} paid={paid} balance={balance} bank={bank} />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
              {invoice.order_id && invoice.orders?.order_no ? (
                <Link to={`/orders?order=${invoice.order_id}`} className="inline-flex items-center gap-1 text-sm text-[#cc0000] hover:underline">
                  <KanbanSquare className="size-3.5" /> From order {invoice.orders.order_no}
                </Link>
              ) : (
                can("edit") && status !== "void" && (
                  <Button size="sm" className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={startPipeline} disabled={linkOrder.isPending}>
                    <KanbanSquare className="size-4" /> {linkOrder.isPending ? "Adding…" : "Start order pipeline"}
                  </Button>
                )
              )}
              {invoice.quotation_id && invoice.quotations?.quote_no && (
                <button type="button" onClick={() => setViewQuote(invoice.quotation_id)} className="inline-flex items-center gap-1 text-sm text-[#cc0000] hover:underline">
                  <FileUp className="size-3.5" /> From quotation {invoice.quotations.quote_no}
                </button>
              )}
            </div>

            {/* Payment ledger + recorder */}
            <div className="print:hidden">
              <div className="mb-2 flex items-center justify-between">
                <h4>Payments</h4>
                <div className="flex gap-2">
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                  )}
                  {can("edit") && status !== "void" && paid === 0 && (
                    <Button size="sm" variant="outline" onClick={doVoid}>
                      <Ban className="size-4" /> Void
                    </Button>
                  )}
                  {can("edit") && balance > 0 && status !== "void" && !adding && (
                    <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                      <Plus className="size-4" /> Record Payment
                    </Button>
                  )}
                </div>
              </div>

              {invoice.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {invoice.payments
                    .slice()
                    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
                    .map((p) => (
                      <li key={p.id} className="flex items-center justify-between rounded-sm bg-secondary px-3 py-2">
                        <span>
                          {formatDate(p.paid_on)} · {METHOD_LABEL[p.method] ?? p.method}
                          {p.kind === "reversal" && <span className="ml-2 rounded-sm bg-[#cc0000]/10 px-1.5 text-xs text-[#cc0000]">Reversal</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={"tabular-nums" + (p.kind === "reversal" ? " text-[#cc0000]" : "")}>
                            {p.kind === "reversal" ? "-" : ""}{formatPKR(p.amount_pkr)}
                          </span>
                          {can("manage") && p.kind === "payment" && !reversedIds.has(p.id) && status !== "void" && (
                            <Button size="icon" variant="ghost" className="size-7" title="Reverse payment" onClick={() => reversePayment(p)}>
                              <Undo2 className="size-3.5 text-[#cc0000]" />
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                </ul>
              )}

              {adding && (
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label>Amount</Label>
                    <Input type="number" min={0} value={amount} placeholder={String(balance)} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={recordPayment} disabled={record.isPending || !amount || Number(amount) <= 0}>Save</Button>
                </div>
              )}
            </div>

            <DialogFooter className="print:hidden">
              <Button variant="outline" onClick={() => printWithFilename(docFilename({
                client: customer?.name ?? "Customer",
                kind: "Invoice",
                mode: shipModeLabel(invoice.invoice_items.map((it) => it.shipping_type)),
              }))}>
                <Printer className="size-4" /> Print / PDF
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    {invoice && <InvoiceEditDialog invoice={invoice} open={editing} onOpenChange={setEditing} />}
    <QuotationDetailDialog
      quote={sourceQuoteQ.data ?? null}
      open={!!viewQuote}
      onOpenChange={(o) => { if (!o) setViewQuote(null); }}
      canEdit={can("edit")}
    />
    {/* Print copy: a body-level portal with no dialog ancestor to clip it. Only this
        prints (theme.css @media print); it is display:none on screen. */}
    {open && invoice && createPortal(
      <div className="invoice-print-mount">
        <InvoiceDoc invoice={invoice} customer={customer} paid={paid} balance={balance} bank={bank} />
      </div>,
      document.body,
    )}
    </>
  );
}
