// Order detail drawer: customer, per-line fulfilment (deliver → FIFO batch draw → rollup),
// notes, stage history. Delivering a line draws stock and rolls the order to partial/delivered.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileText, Pencil, Truck, ShieldAlert, Plus, Repeat2, KanbanSquare, PackagePlus, Maximize2 } from "lucide-react";
import { useOrderInvoice, useOrderInvoiceLines, type OrderInvoiceLine } from "../../data/invoices";
import { useOrderQuotations, useQuotation } from "../../data/quotations";
import { QuotationDetailDialog } from "../invoicing/QuotationDetailDialog";
import { InvoiceDetail } from "../invoicing/InvoiceDetail";
import { toast } from "sonner";
import {
  useOrders,
  useUpdateOrderNotes,
  useFulfilOrderLine,
  useOrderCosts,
  lineStatus,
  canDeliverAtStage,
  STAGE_LABEL,
  type OrderRow,
  type OrderItem,
  type LineStatus,
} from "../../data/orders";
import { useProducts, type ProductListItem } from "../../data/catalog";
import {
  useOrderCorrections,
  useRecordCorrection,
  useOrderRefundablePayments,
  CORRECTION_ACTION_LABEL,
  type CorrectionAction,
  type PaymentMethod,
  type RecordCorrectionInput,
} from "../../data/corrections";
import { useAuth } from "../../data/auth";
import { OrderEditDialog } from "./OrderEditDialog";
import { formatPKR, formatDate, formatDateTime } from "@360/lib/format";
import { StatusBadge } from "../common/StatusBadge";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@360/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";

const TYPE_LABEL: Record<string, string> = { retail: "Retail", trade: "Trade", workshop: "Workshop" };
const LINE_TONE: Record<LineStatus, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  delivered: "border-green-200 bg-green-50 text-green-700",
};
const LINE_LABEL: Record<LineStatus, string> = { pending: "Pending", partial: "Partial", delivered: "Delivered" };

// Drawer wrapper (board): opens the full detail content in a side sheet.
export function OrderDetail({ order, open, onOpenChange }: { order: OrderRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="sr-only"><SheetTitle>{order?.order_no ?? "Order"}</SheetTitle></SheetHeader>
        {order && <div className="px-4 pb-8"><OrderDetailContent order={order} onNavigateAway={() => onOpenChange(false)} /></div>}
      </SheetContent>
    </Sheet>
  );
}

// The full order detail — used both in the board drawer (variant="drawer", single column) and on
// the /orders/:id page (variant="page", a wide multi-column layout that uses the extra space).
export function OrderDetailContent({ order, variant = "drawer", onNavigateAway }: { order: OrderRow; variant?: "drawer" | "page"; onNavigateAway?: () => void }) {
  const updateNotes = useUpdateOrderNotes();
  const productsQ = useProducts(); // cached; derived stock/availability per line product
  const ordersQ = useOrders(); // cached; used to resolve the linked original/replacement order numbers
  const corrsQ = useOrderCorrections(order?.id);
  const { can } = useAuth();
  const [editingNotes, setEditingNotes] = useState(false);
  const [draft, setDraft] = useState("");
  const [corrOpen, setCorrOpen] = useState(false);
  const [editItemsOpen, setEditItemsOpen] = useState(false);

  useEffect(() => {
    setEditingNotes(false);
    setDraft(order?.notes ?? "");
  }, [order?.id, order?.notes]);

  const orderId = order.id;
  const customer = order.customers;
  const events = [...order.order_stage_events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const stockByProduct = new Map((productsQ.data ?? []).map((p) => [p.id, p]));
  const ordersById = new Map((ordersQ.data ?? []).map((o) => [o.id, o]));
  const replacedOrder = order.replaces_order_id ? ordersById.get(order.replaces_order_id) : null;
  // At-fault corrections only make sense once something has actually shipped — nothing delivered,
  // nothing to be at fault for. Gates the "Record" entry point (the dialog also lists only delivered lines).
  const hasDelivered = order.order_items.some((i) => i.qty_delivered > 0);
  // The billed lines, so a discount applied to the invoice shows here even when the order's own
  // line is frozen (delivered) and could not be synced. Matched on product, falling back to name
  // for product-less one-off lines — the same key sync_order_from_invoice pairs on.
  const invoiceLinesQ = useOrderInvoiceLines(orderId);
  // Duplicates matter: an invoice may carry two separate lines for the same product (different
  // qty/price/discount). A plain Map would be last-wins and quote the second line's figures on
  // BOTH order rows, so pair them positionally — the same row_number() pairing
  // sync_order_from_invoice uses, so the display can't contradict what the DB mirrored.
  const billedByItemId = new Map<string, OrderInvoiceLine>();
  {
    const buckets = new Map<string, OrderInvoiceLine[]>();
    const keyOf = (l: { product_id: string | null; name: string }) => l.product_id ?? `oneoff:${l.name}`;
    for (const l of invoiceLinesQ.data ?? []) {
      const k = keyOf(l);
      const bucket = buckets.get(k);
      if (bucket) bucket.push(l);
      else buckets.set(k, [l]);
    }
    const taken = new Map<string, number>();
    for (const it of order.order_items) {
      const k = keyOf(it);
      const n = taken.get(k) ?? 0;
      taken.set(k, n + 1);
      const match = buckets.get(k)?.[n];
      if (match) billedByItemId.set(it.id, match);
    }
  }
  function billedFor(it: OrderItem): OrderInvoiceLine | undefined {
    return billedByItemId.get(it.id);
  }
  const billedGross = (invoiceLinesQ.data ?? []).reduce((s, l) => s + l.qty * l.price_pkr, 0);
  const billedDiscount = (invoiceLinesQ.data ?? []).reduce((s, l) => s + l.discount_pkr, 0);
  const billedTotal = invoiceLinesQ.data?.length ? billedGross - billedDiscount : null;

  async function saveNotes() {
    try {
      await updateNotes.mutateAsync({ id: orderId, notes: draft });
      setEditingNotes(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save notes");
    }
  }

  return (
    <div>
      <div className={variant === "page" ? "mb-6 rounded-md border border-border bg-card p-5" : "mb-4"}>
        <h2 className={"flex flex-wrap items-center gap-3 font-semibold " + (variant === "page" ? "text-2xl" : "text-xl")}><span className="font-mono">{order.order_no}</span> <StatusBadge status={STAGE_LABEL[order.stage]} /></h2>
        <p className="text-sm text-muted-foreground">{customer?.name}{customer?.city ? ` · ${customer.city}` : ""}</p>
        {variant === "drawer" && (
          <Link to={`/orders/${orderId}`} onClick={onNavigateAway} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[#cc0000] underline-offset-4 hover:underline">
            <Maximize2 className="size-3.5" /> Open full view
          </Link>
        )}
      </div>

        {order.replaces_order_id && (
          <div className="mb-3 flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Repeat2 className="size-3.5 shrink-0" />
            <span>
              At-fault replacement re-ship,
              {replacedOrder?.order_no && (
                <> for <Link to={`/orders?order=${order.replaces_order_id}`} className="font-medium underline">{replacedOrder.order_no}</Link></>
              )}
              {" "}no charge to the customer.
            </span>
          </div>
        )}

        <div className={variant === "page" ? "grid items-start gap-6 lg:grid-cols-2 [&>section]:min-w-0" : "space-y-6"}>
          <section>
            <h4 className="mb-2">Customer</h4>
            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{customer?.name}</p>
              <p className="text-muted-foreground">{customer?.email}</p>
              <p className="text-muted-foreground">{customer?.phone}</p>
              {customer && <StatusBadge status={TYPE_LABEL[customer.type] ?? customer.type} className="mt-2" />}
            </div>
          </section>

          <section className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <h4>Items &amp; fulfilment</h4>
              {/* Editing items is only safe before anything ships (stock is drawn at fulfilment). */}
              {can("edit") && !hasDelivered && order.stage !== "cancelled" && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setEditItemsOpen(true)}>
                  <Pencil className="size-3" /> Edit items
                </Button>
              )}
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-black hover:bg-black">
                    <TableHead className="text-white whitespace-nowrap">Item</TableHead>
                    <TableHead className="text-white whitespace-nowrap text-right">Qty</TableHead>
                    <TableHead className="text-white whitespace-nowrap text-right">Delivered</TableHead>
                    <TableHead className="text-white whitespace-nowrap">Status</TableHead>
                    <TableHead className="text-white whitespace-nowrap text-right">Price</TableHead>
                    <TableHead className="text-white whitespace-nowrap text-right">Disc</TableHead>
                    <TableHead className="text-white whitespace-nowrap text-right">Discount</TableHead>
                    <TableHead className="text-white whitespace-nowrap text-right">Line total</TableHead>
                    <TableHead className="text-white whitespace-nowrap text-right">{can("edit") ? "Deliver" : ""}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.order_items.map((it) => (
                    <LineRow key={it.id} item={it} billed={billedFor(it)} stock={it.product_id ? stockByProduct.get(it.product_id) : undefined} canEdit={can("edit")} orderCancelled={order.stage === "cancelled"} canDeliverStage={canDeliverAtStage(order.stage)} />
                  ))}
                  {/* With a discount on the invoice the footer reads like the invoice itself —
                      amount, discount, total — instead of a single ambiguous figure. */}
                  {billedTotal != null ? (
                    <>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="text-muted-foreground">Invoice amount</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPKR(billedGross)}</TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="text-muted-foreground">Discount</TableCell>
                        <TableCell className={cn("text-right tabular-nums", billedDiscount > 0 && "text-[#cc0000]")}>
                          {billedDiscount > 0 ? `−${formatPKR(billedDiscount)}` : "—"}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                      <TableRow className="bg-secondary hover:bg-secondary">
                        <TableCell colSpan={7} className="[font-family:var(--font-heading)] uppercase">Total</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{formatPKR(billedTotal ?? order.total_pkr)}</TableCell>
                        <TableCell />
                      </TableRow>
                      {billedTotal != null && Math.abs(billedTotal - order.total_pkr) >= 0.01 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={9} className="pt-1 text-[11px] text-amber-700">
                            Realized order value is {formatPKR(order.total_pkr)} — delivered lines keep the price
                            they shipped at. Record an at-fault correction to book the difference.
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ) : (
                    <TableRow className="bg-secondary hover:bg-secondary">
                      <TableCell colSpan={7} className="[font-family:var(--font-heading)] uppercase">Total</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatPKR(order.total_pkr)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Delivering a line automatically draws your oldest stock first (FIFO) and rolls the order up. Deliver once stock is available.</p>
          </section>

          <section className="lg:col-span-2">
            <h4 className="mb-2">Costs &amp; profit</h4>
            <OrderCosts orderId={orderId} total={order.total_pkr} billedTotal={billedTotal} isReplacement={order.replaces_order_id != null} />
          </section>

          <section>
            <h4 className="mb-2">Documents</h4>
            <div className="space-y-2">
              <InvoiceLink orderId={orderId} canEdit={can("edit")} cancelled={order.stage === "cancelled"} />
              <OrderQuotations orderId={orderId} />
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5"><ShieldAlert className="size-4 text-[#cc0000]" /> At-fault corrections</h4>
              {can("edit") && hasDelivered && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setCorrOpen(true)}>
                  <Plus className="size-3" /> Record
                </Button>
              )}
            </div>
            {can("edit") && !hasDelivered && (
              <p className="mb-2 text-xs text-muted-foreground">Corrections open once a line has been delivered.</p>
            )}
            <div className="space-y-2">
              {(corrsQ.data ?? []).map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="rounded-full border border-[#cc0000]/30 bg-[#cc0000]/10 px-2 py-0.5 text-xs font-medium text-[#cc0000]">{CORRECTION_ACTION_LABEL[c.action]}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{c.correction_no}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.action === "replacement" && ordersById.get(c.replacement_order_id ?? "")?.stage !== "delivered" ? "loss on re-delivery" : `−${formatPKR(c.cost_pkr)}`}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{c.reason}{c.item_name ? ` · ${c.item_name}` : ""}{c.action === "replacement" && c.product_name ? ` · re-ship ${c.qty}× ${c.product_name}` : ""}</p>
                  {c.action === "replacement" && c.replacement_order_id && (() => {
                    const ro = ordersById.get(c.replacement_order_id);
                    return (
                      <Link to={`/orders?order=${c.replacement_order_id}`} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#cc0000] hover:underline">
                        <KanbanSquare className="size-3" /> Re-delivery {ro?.order_no ?? ""}{ro ? ` · ${STAGE_LABEL[ro.stage]}` : ""}
                      </Link>
                    );
                  })()}
                  <p className="text-[11px] text-muted-foreground">{formatDate(c.created_at)}</p>
                </div>
              ))}
              {(corrsQ.data ?? []).length === 0 && <p className="rounded-md border border-border bg-secondary p-3 text-xs text-muted-foreground">No corrections. This order was fine.</p>}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4>Notes</h4>
              {can("edit") && !editingNotes && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => { setDraft(order.notes ?? ""); setEditingNotes(true); }}>
                  <Pencil className="size-3" /> Edit
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Add a note…" />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={saveNotes} disabled={updateNotes.isPending}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
                {order.notes || "No notes yet."}
              </p>
            )}
          </section>

          <section>
            <h4 className="mb-2">History</h4>
            {/* Stage transitions + at-fault corrections, interleaved chronologically. */}
            <ol className="relative space-y-3 border-l border-border pl-4">
              {[
                ...events.map((h) => ({ at: h.at, kind: "stage" as const, stage: h.stage, actor: h.actor })),
                ...(corrsQ.data ?? []).map((c) => ({ at: c.created_at, kind: "correction" as const, corr: c })),
              ]
                .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
                .map((it, i) => (
                  <li key={i} className="text-sm">
                    <span className={"absolute -left-[5px] mt-1.5 size-2 rounded-full " + (it.kind === "correction" ? "bg-amber-500" : "bg-[#cc0000]")} />
                    {it.kind === "stage" ? (
                      <>
                        <p className="font-medium">{STAGE_LABEL[it.stage]}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(it.at)}{it.actor ? ` · ${it.actor}` : ""}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">
                          At-fault: {CORRECTION_ACTION_LABEL[it.corr.action]}
                          {it.corr.action === "replacement" && it.corr.product_name
                            ? `, re-ship ${it.corr.qty}× ${it.corr.product_name}`
                            : it.corr.amount_pkr
                              ? `, ${formatPKR(it.corr.amount_pkr)}`
                              : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">{it.corr.reason} · {formatDateTime(it.corr.created_at)}</p>
                      </>
                    )}
                  </li>
                ))}
              {events.length === 0 && (corrsQ.data ?? []).length === 0 && <li className="text-sm text-muted-foreground">No history yet.</li>}
            </ol>
          </section>
        </div>
        <CorrectionDialog order={order} open={corrOpen} onOpenChange={setCorrOpen} />
        {editItemsOpen && <OrderEditDialog order={order} open onOpenChange={setEditItemsOpen} />}
    </div>
  );
}

// Record an at-fault correction: replacement (free re-ship of the at-fault item, house stock only),
// refund (reverse a customer payment — admin only), or compensation (goodwill). The RPC is atomic
// and never touches the original sale, so investor settlement is untouched.
// The order's invoice (one-per-order): links to it, or offers to create one prefilled from the order.
function InvoiceLink({ orderId, canEdit, cancelled }: { orderId: string; canEdit: boolean; cancelled: boolean }) {
  const q = useOrderInvoice(orderId);
  // Opened in place — viewing the document must not navigate away from the order you're reading.
  const [viewing, setViewing] = useState(false);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Checking…</p>;
  const inv = q.data;
  if (inv) {
    return (
      <>
        <button type="button" onClick={() => setViewing(true)} className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/30">
          <div>
            <p className="text-sm font-medium">{inv.invoice_no}</p>
            <p className="text-xs capitalize text-muted-foreground">{inv.status} · balance {formatPKR(inv.balance_pkr)}</p>
          </div>
          <span className="shrink-0 text-sm font-medium text-[#cc0000]">View invoice</span>
        </button>
        <InvoiceDetail invoiceId={viewing ? inv.id : null} open={viewing} onOpenChange={setViewing} />
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5">
      <p className="text-sm text-muted-foreground">Not invoiced yet.</p>
      {canEdit && !cancelled && (
        <Link to={`/invoices?new=1&order=${orderId}`} className="inline-flex items-center gap-1 rounded-sm bg-[#cc0000] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#a30000]">
          <FileText className="size-4" /> Create invoice
        </Link>
      )}
    </div>
  );
}

// Order value vs realized cost of goods (drawn at delivery) → gross profit.
//
// An at-fault REPLACEMENT re-ship is a different shape: its lines are priced at 0 (no revenue,
// by design — record_correction, 090070) and the units go out as kind='replacement', so the
// house bears their landed cost and there is no profit to make. Showing that order through the
// normal value/COGS/profit lens would read "cost us nothing", so it gets its own labels.
function OrderCosts({
  orderId,
  total,
  billedTotal,
  isReplacement,
}: {
  orderId: string;
  total: number;
  billedTotal: number | null;
  isReplacement: boolean;
}) {
  const q = useOrderCosts(orderId);
  const cogs = q.data?.cogs_pkr ?? 0;
  const borne = q.data?.replacement_cost_pkr ?? 0;
  // A replacement can never profit: the only movement is cost out the door.
  const profit = total - cogs - borne;
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-md border border-border bg-card px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Order value</p>
        <p className="text-sm font-bold tabular-nums">{formatPKR(total)}</p>
        {isReplacement ? (
          <p className="text-[10px] text-muted-foreground">free re-ship — no revenue</p>
        ) : (
          /* Realized order value is frozen per delivered line, so a later invoice edit (e.g. a
             discount) can leave the two apart. Surfaced rather than silently reconciled. */
          billedTotal != null && Math.abs(billedTotal - total) >= 0.01 && (
            <p className="text-[10px] font-medium text-amber-700">invoiced {formatPKR(billedTotal)}</p>
          )
        )}
      </div>
      <div className="rounded-md border border-border bg-card px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {isReplacement ? "Cost we bear" : "Cost of goods"}
        </p>
        <p className="text-sm font-semibold tabular-nums text-muted-foreground">
          {q.isLoading ? "…" : formatPKR(isReplacement ? borne : cogs)}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {isReplacement ? "at-fault — booked as an expense" : "realized on delivery"}
        </p>
      </div>
      <div className="rounded-md border border-border bg-card px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {isReplacement ? "Loss" : "Gross profit"}
        </p>
        <p className="text-sm font-semibold tabular-nums text-[#cc0000]">{q.isLoading ? "…" : formatPKR(profit)}</p>
      </div>
    </div>
  );
}

// Quotations linked to this order (0..n).
function OrderQuotations({ orderId }: { orderId: string }) {
  const q = useOrderQuotations(orderId);
  const { can } = useAuth();
  // Opened in place (id-scoped fetch), so reading a quote doesn't jump to Sales Documents.
  const [viewId, setViewId] = useState<string | null>(null);
  const quoteQ = useQuotation(viewId);
  if (q.isLoading || (q.data ?? []).length === 0) return null;
  return (
    <>
      {(q.data ?? []).map((quote) => (
        <button type="button" key={quote.id} onClick={() => setViewId(quote.id)} className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/30">
          <div>
            <p className="text-sm font-medium">{quote.quote_no ?? "Quotation"}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{formatPKR(quote.total_pkr)}</p>
          </div>
          <span className="shrink-0 text-sm font-medium text-[#cc0000]">View quotation</span>
        </button>
      ))}
      <QuotationDetailDialog
        quote={quoteQ.data ?? null}
        open={!!viewId}
        onOpenChange={(o) => { if (!o) setViewId(null); }}
        canEdit={can("edit")}
      />
    </>
  );
}

function CorrectionDialog({ order, open, onOpenChange }: { order: OrderRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const record = useRecordCorrection(order.id);
  const paymentsQ = useOrderRefundablePayments(open ? order.id : undefined);
  const { can } = useAuth();
  const isAdmin = can("manage");
  const [itemId, setItemId] = useState("none");
  const [action, setAction] = useState<CorrectionAction>("replacement");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState("1");
  const [disposition, setDisposition] = useState<"written_off" | "restocked">("written_off");
  const [paymentId, setPaymentId] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setItemId("none"); setAction("replacement"); setAmount(""); setQty("1"); setDisposition("written_off");
    setPaymentId(""); setMethod("cash"); setReason(""); setNotes("");
  }, [open]);

  // Only delivered lines can be at fault — an undelivered line hasn't shipped yet.
  const deliveredItems = order.order_items.filter((i) => i.qty_delivered > 0);
  const item = order.order_items.find((i) => i.id === itemId) ?? null;
  const payments = paymentsQ.data ?? [];

  async function submit() {
    if (!reason.trim()) return toast.error("Add a reason for the correction");

    if (action === "replacement") {
      // A replacement re-ships specific product(s) from house stock. "Whole order" re-ships every
      // product-backed line at its ordered qty; a single item re-ships the qty typed above. Each
      // line is its own correction (the RPC takes one product), so we book them one by one and
      // report which (if any) couldn't ship — e.g. investor items, which house stock can't cover.
      const targets = itemId === "none" ? deliveredItems.filter((i) => i.product_id) : item?.product_id ? [item] : [];
      if (targets.length === 0)
        return toast.error(itemId === "none" ? "This order has no delivered, product-backed items to re-ship." : "Pick the item to re-ship.");
      let done = 0;
      const errs: string[] = [];
      for (const t of targets) {
        const reshipQty = itemId === "none" ? t.qty_delivered : Math.max(1, Math.floor(Number(qty) || 1));
        try {
          await record.mutateAsync({ order_id: order.id, order_item_id: t.id, action, amount_pkr: null, product_id: t.product_id as string, qty: reshipQty, wrong_unit_disposition: disposition, payment_id: null, method: null, reason: reason.trim(), notes: notes.trim() || null });
          done++;
        } catch (e) {
          errs.push(`${t.name}: ${e instanceof Error ? e.message : "could not ship"}`);
        }
      }
      if (errs.length === 0) {
        toast.success(targets.length > 1 ? "Whole order re-shipped" : "Correction recorded");
        onOpenChange(false);
      } else if (done > 0) {
        toast.error(`Re-shipped ${done} of ${targets.length}. Couldn't: ${errs.join("; ")}`);
        onOpenChange(false);
      } else {
        toast.error(errs[0]);
      }
      return;
    }

    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    const oiId = itemId === "none" ? null : itemId;
    let input: RecordCorrectionInput;
    if (action === "refund") {
      if (!paymentId) return toast.error("Choose the payment to refund");
      input = { order_id: order.id, order_item_id: oiId, action, amount_pkr: amt, product_id: null, qty: null, wrong_unit_disposition: null, payment_id: paymentId, method, reason: reason.trim(), notes: notes.trim() || null };
    } else {
      input = { order_id: order.id, order_item_id: oiId, action, amount_pkr: amt, product_id: null, qty: null, wrong_unit_disposition: null, payment_id: null, method: null, reason: reason.trim(), notes: notes.trim() || null };
    }
    try {
      await record.mutateAsync(input);
      toast.success("Correction recorded");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the correction");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record at-fault correction</DialogTitle>
          <DialogDescription>Only when 360 is at fault. This never reverses the sale margin. It books the cost of the mistake to the house.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>At-fault item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger aria-label="At-fault item"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Whole order</SelectItem>
                {deliveredItems.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as CorrectionAction)}>
              <SelectTrigger aria-label="Action"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="replacement">Replacement (re-ship free)</SelectItem>
                <SelectItem value="compensation">Compensation (goodwill)</SelectItem>
                {isAdmin && <SelectItem value="refund">Refund (reverse a payment)</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {action === "replacement" && (
            <div className="grid grid-cols-2 gap-3">
              {itemId !== "none" && (
                <div className="space-y-2"><Label>Re-ship qty</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
              )}
              <div className="space-y-2">
                <Label>Wrong unit</Label>
                <Select value={disposition} onValueChange={(v) => setDisposition(v as "written_off" | "restocked")}>
                  <SelectTrigger aria-label="Wrong unit"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="written_off">Written off</SelectItem><SelectItem value="restocked">Restocked</SelectItem></SelectContent>
                </Select>
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                {itemId === "none"
                  ? "Re-ships every delivered item at its delivered quantity, from house stock (FIFO), at no charge."
                  : `Re-ships ${item?.name ?? "the at-fault item"} from house stock (FIFO) at no charge.`}
                {" "}Investor items can't be replaced. Refund or compensate.
              </p>
            </div>
          )}

          {action === "refund" && (
            <>
              <div className="space-y-2">
                <Label>Payment to refund</Label>
                <Select value={paymentId} onValueChange={setPaymentId}>
                  <SelectTrigger aria-label="Payment to refund"><SelectValue placeholder={payments.length ? "Pick a payment…" : "No refundable payment"} /></SelectTrigger>
                  <SelectContent>{payments.map((p) => <SelectItem key={p.id} value={p.id}>{p.invoice_no} · {formatPKR(p.remaining_pkr)} refundable</SelectItem>)}</SelectContent>
                </Select>
                {payments.length === 0 && <p className="text-xs text-muted-foreground">This order has no recorded payment to reverse.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Refund amount</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                    <SelectTrigger aria-label="Method"><SelectValue /></SelectTrigger>
                    <SelectContent>{(["cash", "bank_transfer", "card", "easypaisa", "other"] as PaymentMethod[]).map((m) => <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {action === "compensation" && (
            <div className="space-y-2"><Label>Goodwill amount</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          )}

          <div className="space-y-2"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong (our fault)" /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={record.isPending}>{record.isPending ? "Recording…" : "Record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LineRow({ item, billed, stock, canEdit, orderCancelled, canDeliverStage }: { item: OrderItem; billed: OrderInvoiceLine | undefined; stock: ProductListItem | undefined; canEdit: boolean; orderCancelled: boolean; canDeliverStage: boolean }) {
  const fulfil = useFulfilOrderLine();
  const status = lineStatus(item.qty_delivered, item.qty);
  const discPct = billed?.discount_pct ?? item.discount_pct;
  const discPkr = billed?.discount_pkr ?? item.discount_pkr;
  const billedNet = billed ? billed.qty * billed.price_pkr - billed.discount_pkr : null;
  const outstanding = item.qty - item.qty_delivered;
  const [qty, setQty] = useState(String(outstanding));

  // Stock warning by REAL on-hand units, not the availability LABEL — a "made to order" product
  // (the default for new products) reads 'made_to_order' even at zero stock, which would otherwise
  // slip past an out-of-stock check. Out of stock = nothing on hand (red); low = at/under threshold
  // (amber). Both offer a jump to Purchasing to source more (pre-filled with the outstanding qty).
  const onHand = stock?.on_hand_qty ?? null;
  const outOfStock = stock != null && onHand != null && onHand <= 0;
  const lowStock = stock != null && !outOfStock && stock.availability === "low_stock";
  const showStock = !!item.product_id && status !== "delivered" && !orderCancelled && (outOfStock || lowStock);

  async function deliver() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) return toast.error("Enter a whole quantity");
    if (n > outstanding) return toast.error(`Only ${outstanding} outstanding on this line`);
    try {
      await fulfil.mutateAsync({ line_id: item.id, qty: n });
      toast.success(`Delivered ${n} × ${item.name}`);
      setQty(String(Math.max(0, outstanding - n)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not deliver");
    }
  }

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{item.name}</p>
        {showStock && (
          <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", outOfStock ? "text-[#cc0000]" : "text-amber-700")}>
            {outOfStock ? "Out of stock" : `Low · ${stock?.on_hand_qty} left`}
            {canEdit && (
              <Link to={`/purchasing?restock=${item.product_id}&qty=${outstanding}`} className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                <PackagePlus className="size-3" /> restock
              </Link>
            )}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
      <TableCell className="text-right tabular-nums">{item.qty_delivered}/{item.qty}</TableCell>
      <TableCell><span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", LINE_TONE[status])}>{LINE_LABEL[status]}</span></TableCell>
      {/* Always shown, even at 0% — this is the internal order board, not the customer-facing
          invoice, so a standing Disc column is useful rather than noise. Prefers the invoice's
          figures: they are what the customer is billed, and on a delivered (frozen) line they
          are the ONLY place a discount exists. */}
      <TableCell className="text-right tabular-nums">
        {formatPKR(billed?.price_pkr ?? item.list_price_pkr ?? item.price_pkr)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {discPct > 0 ? `${+(discPct * 100).toFixed(2)}%` : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-[#cc0000]">
        {discPkr > 0 ? `−${formatPKR(discPkr)}` : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatPKR(item.price_pkr * item.qty)}
        {/* The order's realized figure is frozen once the line ships, so it can legitimately
            disagree with a later invoice edit. Show both rather than pick one silently. */}
        {billedNet != null && Math.abs(billedNet - item.price_pkr * item.qty) >= 0.01 && (
          <span className="block text-[11px] font-medium text-amber-700">
            invoiced {formatPKR(billedNet)}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {canEdit && !orderCancelled && status !== "delivered" && (item.product_id || item.oneoff_product_id) && (
          canDeliverStage ? (
            <div className="flex items-center justify-end gap-1">
              <Input type="number" min={1} max={outstanding} value={qty} onChange={(e) => setQty(e.target.value)} className="h-8 w-14" />
              <Button size="sm" className="h-8 gap-1 bg-[#cc0000] text-xs text-white hover:bg-[#a30000]" disabled={fulfil.isPending} onClick={deliver}>
                <Truck className="size-3.5" /> Deliver
              </Button>
            </div>
          ) : (
            <span className="whitespace-nowrap text-xs text-muted-foreground">Ready to Ship first</span>
          )
        )}
      </TableCell>
    </TableRow>
  );
}
