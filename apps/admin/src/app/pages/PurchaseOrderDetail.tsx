// Purchase Order detail — the working screen: set the frozen RMB rate, add lines (with the
// item + shipping + packaging landed-cost build-up), mark item/ship payables paid, and
// RECEIVE a line (→ creates a cost-bearing batch + a `receive` stock movement via the RPC).
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Plus, Trash2, PackageCheck, Tag, Maximize2 } from "lucide-react";
import { usePageHeader } from "../components/common/PageHeader";
import { toast } from "sonner";
import {
  usePurchaseOrder,
  useUpdatePurchaseOrder,
  useAddPOLine,
  useUpdatePOLine,
  useRecordPOPayment,
  useDeletePOLine,
  useReceivePOLine,
  lineLanded,
  lineDues,
  PO_STATUS_LABEL,
  type POLine,
  type POStatus,
} from "../data/purchasing";
import { StatusBadge, PaymentBadge } from "../components/purchasing/StatusBadges";
import { paymentStatusOf } from "../data/poState";
import { useVendorBalances, useLogisticsVendors, VENDOR_ROLE_LABEL } from "../data/vendorAdvances";
import { useProducts, useUpdateProductPrice } from "../data/catalog";
import { useAuth } from "../data/auth";
import { formatPKR, formatDate } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@360/ui/sheet";
import { useConfirm } from "../components/common/confirm";

// Manually settable statuses. "received" is NOT among them: it is DERIVED, reached only by
// receiving lines through receive_po_line (which mints the cost-bearing batches + landed cost).
// A PO already received is terminal, so its status is locked (flipping it out would desync its
// batches).
//
// "Arrived" IS offered in the dropdown (below) so it mirrors the board's lanes, but choosing it
// runs the receive flow rather than writing the status — a plain flip would leave the PO reading
// Arrived with nothing in stock and no landed cost in COGS.
const SETTABLE_STATUSES: POStatus[] = ["planning", "approved", "ordered", "in_production", "in_transit", "cancelled"];
const today = () => new Date().toISOString().slice(0, 10);

// Route wrapper (/purchasing/:id) — the full-page view.
export function PurchaseOrderDetail() {
  const { id } = useParams();
  const poQ = usePurchaseOrder(id); // cached; the content below reuses the same query
  usePageHeader("Purchasing", poQ.data?.po_no ?? undefined);
  return <PurchaseOrderDetailContent id={id} variant="page" />;
}

// Drawer wrapper (board): the same detail content in a side sheet, as on the order pipeline.
export function PurchaseOrderDrawer({ id, open, onOpenChange }: { id: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="sr-only"><SheetTitle>Purchase order</SheetTitle></SheetHeader>
        {id && (
          <div className="px-4 pb-8">
            <PurchaseOrderDetailContent id={id} variant="drawer" onNavigateAway={() => onOpenChange(false)} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// The full PO detail — used both in the board drawer (variant="drawer", narrow single column) and
// on the /purchasing/:id page (variant="page", the wide multi-column layout).
export function PurchaseOrderDetailContent({ id, variant = "page", onNavigateAway }: { id: string | undefined; variant?: "page" | "drawer"; onNavigateAway?: () => void }) {
  const poQ = usePurchaseOrder(id);
  const updatePO = useUpdatePurchaseOrder();
  const receiveAllM = useReceivePOLine(id ?? "");
  const payAllM = useRecordPOPayment(id ?? "");
  const balancesQ = useVendorBalances();
  const freightQ = useLogisticsVendors();
  const productsQ = useProducts(); // current prices + derived weighted-average cost, for the reprice review
  const { can } = useAuth();
  const editable = can("edit");
  // Products queued for a reprice prompt — receiving stock pushes the received product(s) here so the
  // "Reprice" dialog pops automatically (stepping through one at a time). The panel buttons push too.
  const [repriceQueue, setRepriceQueue] = useState<string[]>([]);
  // Above the loading/error early-returns: a hook must run on every render.
  const confirm = useConfirm();

  if (poQ.isLoading) return <p className="p-10 text-center text-muted-foreground">Loading…</p>;
  if (poQ.isError || !poQ.data) return <p className="p-10 text-center text-[#cc0000]">Couldn&apos;t load this purchase order.</p>;
  const po = poQ.data;
  const rate = po.frozen_rate_rmb_pkr;
  const lines = po.purchase_order_lines ?? [];
  // Once anything is received, the rate is the basis of already-frozen batch costs — the DB
  // trigger guard_po_rate_locked (090120) rejects a change, so don't offer one.
  const rateLocked = lines.some((l) => l.qty_received > 0);
  // this vendor's available credit (advance balance) — payments on a line can draw from it
  const vendorAcct = (balancesQ.data ?? []).find((v) => v.supplier_id === po.supplier_id);
  const vendorCredit = Math.max(0, vendorAcct?.balance_pkr ?? 0);
  const grandLanded = lines.reduce((s, l) => s + lineLanded(l, rate).landedTotal, 0);

  // Reprice review: the distinct products this PO has received. New stock shifts each product's
  // weighted-average cost (what the catalogue prices against), so we surface the current cost +
  // selling prices + the markup they now yield, and let the operator reprice — nothing auto-changes.
  const productById = new Map((productsQ.data ?? []).map((p) => [p.id, p]));
  const seenProducts = new Set<string>();
  const repriceItems: RepriceItem[] = [];
  for (const l of lines) {
    if (l.qty_received <= 0 || !l.product_id || seenProducts.has(l.product_id)) continue;
    seenProducts.add(l.product_id);
    const p = productById.get(l.product_id);
    repriceItems.push({
      id: l.product_id,
      name: p?.name ?? l.products?.name ?? "Product",
      cost: p?.weighted_avg_cost_pkr ?? null,
      retail: p?.price_pkr ?? null,
      reseller: p?.reseller_price_pkr ?? null,
    });
  }
  const openReprice = (id: string) => setRepriceQueue([id]);
  const currentRepriceId = repriceQueue[0] ?? null;

  // Goods + money position for the two summary cards, via the shared lineDues helper (same
  // arithmetic as usePODues / vendor_payables), so the header agrees with the Payments tab.
  const unitsOrdered = lines.reduce((s, l) => s + l.qty_ordered, 0);
  const unitsReceived = lines.reduce((s, l) => s + l.qty_received, 0);
  const outstanding = lines.reduce((s, l) => s + Math.max(0, l.qty_ordered - l.qty_received), 0);
  let cost = 0, paid = 0, due = 0, banked = 0;
  for (const l of lines) {
    const d = lineDues(l, rate);
    cost += d.cost; paid += d.paid; due += d.due; banked += d.credit;
  }
  const payStatus = cost > 0 ? paymentStatusOf({ cost, paid, due }) : null;
  const busy = receiveAllM.isPending || payAllM.isPending;

  // Receive every outstanding line at once (each still goes through receive_po_line, so batches +
  // landed cost + stock movements are created correctly). Sequential to keep the ledger consistent.
  async function receiveAllOutstanding() {
    if (rate == null) return toast.error("Set the RMB rate before receiving.");
    const pending = lines.filter((l) => l.qty_ordered - l.qty_received > 0);
    if (!pending.length) return toast.error("There is nothing outstanding to receive on this PO.");
    if (!(await confirm({ title: `Receive all ${outstanding} outstanding unit(s) on ${po.po_no}?`, description: "This creates stock batches at landed cost.", confirmLabel: "Receive all" }))) return;
    try {
      for (const l of pending) await receiveAllM.mutateAsync({ line_id: l.id, qty: l.qty_ordered - l.qty_received, received_on: today() });
      toast.success("Received all outstanding lines");
      // New stock changed these products' cost — prompt to review pricing, one product at a time.
      const receivedIds = [...new Set(pending.map((l) => l.product_id).filter((x): x is string => !!x))];
      if (receivedIds.length) setRepriceQueue(receivedIds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not receive everything");
    }
  }

  // Pay the whole outstanding balance in one action — via record_po_payment, same as paying a line
  // by hand. record_po_payment SETS the recorded amount (it does not add to it), so each call must
  // send the line's FULL cost, not its remaining due: sending the due on a part-paid line would
  // overwrite the earlier payment downward and the line could never settle.
  async function payFullBalance() {
    if (rate == null) return toast.error("Set the RMB rate before paying.");
    const owing = lines.map((l) => ({ l, d: lineDues(l, rate) })).filter((x) => x.d.itemDue > 0 || x.d.shipDue > 0);
    if (!owing.length) return toast.info("Nothing outstanding to pay.");
    if (!(await confirm({ title: `Record a payment of ${formatPKR(due)}?`, description: `Settles the full outstanding balance on ${po.po_no}.`, confirmLabel: "Record payment" }))) return;
    try {
      for (const { l, d } of owing) {
        if (d.itemDue > 0) await payAllM.mutateAsync({ line_id: l.id, kind: "item", amount_pkr: d.itemCost, use_credit: false, occurred_on: today() });
        if (d.shipDue > 0) await payAllM.mutateAsync({ line_id: l.id, kind: "ship", amount_pkr: d.shipCost, use_credit: false, occurred_on: today() });
      }
      toast.success("Recorded full payment");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the full payment");
    }
  }

  // Air/sea freight vendors — for the per-line picker/label + resolving the PO's default.
  const freightVendors = (freightQ.data ?? []).filter((v) => v.active);
  const freightName = (vid: string | null) => {
    const v = (freightQ.data ?? []).find((x) => x.id === vid);
    return v ? `${v.name} · ${VENDOR_ROLE_LABEL[v.role]}` : null;
  };
  const poFreightName = freightName(po.freight_vendor_id);

  return (
    <div className="space-y-6">
      <div>
        {variant === "page" ? (
          <Link to="/purchasing" className="inline-flex items-center gap-1.5 rounded-md bg-[#cc0000]/10 px-2.5 py-1 text-sm font-medium text-[#cc0000] transition-colors hover:bg-[#cc0000]/20">
            <ArrowLeft className="size-4" /> Purchasing
          </Link>
        ) : (
          <Link to={`/purchasing/${po.id}`} onClick={onNavigateAway} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#cc0000] underline-offset-4 hover:underline">
            <Maximize2 className="size-3.5" /> Open full view
          </Link>
        )}
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className={cn("font-mono", variant === "page" ? "text-2xl" : "text-xl")}>{po.po_no}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{po.suppliers?.name ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={po.status} />
            {payStatus && <PaymentBadge status={payStatus} />}
          </div>
        </div>
      </div>

      {/* Goods + money at a glance — the two questions this screen answers */}
      <div className={cn("grid gap-4", variant === "page" ? "sm:grid-cols-2" : "lg:grid-cols-2")}>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Goods</p>
          <p className="mt-1 [font-family:var(--font-heading)] text-2xl font-bold tabular-nums">{unitsReceived}<span className="text-base font-normal text-muted-foreground"> / {unitsOrdered} received</span></p>
          <p className="mt-1 text-sm text-muted-foreground">Total landed <span className="font-medium text-foreground tabular-nums">{rate != null ? formatPKR(grandLanded) : "—"}</span></p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Money</p>
              <p className="mt-1 [font-family:var(--font-heading)] text-2xl font-bold tabular-nums">{formatPKR(paid)}<span className="text-base font-normal text-muted-foreground"> / {formatPKR(cost)} paid</span></p>
            </div>
            {editable && due > 0 && (
              <Button size="sm" variant="outline" className="text-[#cc0000]" disabled={busy} onClick={payFullBalance}>
                Pay full balance
              </Button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
            {due > 0 && <span className="text-amber-700 tabular-nums">{formatPKR(due)} due</span>}
            {vendorCredit > 0 && <span className="text-green-700 tabular-nums">{formatPKR(vendorCredit)} credit on hand</span>}
            {banked > 0 && <span className="text-green-700 tabular-nums">+{formatPKR(banked)} banked</span>}
            {due <= 0 && cost > 0 && <span className="text-green-700">Fully paid</span>}
          </div>
        </div>
      </div>

      {/* Header controls */}
      <div className={cn("grid gap-4 rounded-md border border-border bg-card p-4", variant === "page" ? "sm:grid-cols-4" : "sm:grid-cols-2")}>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          {po.status === "received" ? (
            <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">{PO_STATUS_LABEL.received}</div>
          ) : (
            <Select
              value={po.status}
              disabled={!editable}
              onValueChange={(v) => {
                // Arrival is never a status write — route to the receive flow, which mints the
                // batches and landed cost and lets receive_po_line set 'received' itself.
                if (v === "received") { void receiveAllOutstanding(); return; }
                updatePO.mutate({ id: po.id, status: v as POStatus });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SETTABLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{PO_STATUS_LABEL[s]}</SelectItem>)}
                <SelectItem value="received">Arrived — receives all outstanding lines</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">RMB → PKR rate (frozen)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            defaultValue={rate ?? ""}
            disabled={!editable || rateLocked}
            placeholder="set before receiving"
            onBlur={(e) => {
              const v = e.target.value.trim() ? Number(e.target.value) : null;
              if (v !== rate) updatePO.mutate({ id: po.id, frozen_rate_rmb_pkr: v });
            }}
          />
          {rateLocked && (
            <p className="text-[11px] text-muted-foreground">Locked — stock was received at this rate.</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ordered on</Label>
          <Input type="date" defaultValue={po.ordered_on ?? ""} disabled={!editable}
            onBlur={(e) => updatePO.mutate({ id: po.id, ordered_on: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Expected on</Label>
          <Input type="date" defaultValue={po.expected_on ?? ""} disabled={!editable}
            onBlur={(e) => updatePO.mutate({ id: po.id, expected_on: e.target.value || null })} />
        </div>
      </div>

      {/* Notes — tracking number, bill of lading, vendor reference, etc. */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Notes <span className="text-muted-foreground">(tracking #, BL, vendor reference…)</span></Label>
        <Textarea rows={2} defaultValue={po.notes ?? ""} disabled={!editable} placeholder={editable ? "Add a tracking number, bill of lading, or any reference for this shipment…" : undefined}
          onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (po.notes ?? null)) updatePO.mutate({ id: po.id, notes: v }); }} />
      </div>

      {rate == null && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Set the RMB → PKR rate above before receiving. The landed cost is frozen from it.
        </p>
      )}

      {/* Lines */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="[font-family:var(--font-heading)] text-lg uppercase tracking-wide">Lines</h2>
        {editable && outstanding > 0 && (
          <Button size="sm" variant="outline" className="text-[#cc0000]" disabled={busy || rate == null} title={rate == null ? "Set the RMB rate first" : undefined} onClick={receiveAllOutstanding}>
            <PackageCheck className="size-4" /> Receive all outstanding
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              {["Product", "Ord / Recv", "Unit RMB", "Landed / unit", "Landed total", "Freight", "Item paid", "Ship paid", "Receive", ""].map((c) => (
                <TableHead key={c} className={cn("text-white whitespace-nowrap", ["Unit RMB", "Landed / unit", "Landed total"].includes(c) ? "text-right" : "", c === "" ? "w-10" : "")}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <LineRow key={l.id} poId={po.id} line={l} rate={rate} editable={editable} vendorAccountId={vendorAcct?.vendor_account_id ?? null} credit={vendorCredit}
                freightVendors={freightVendors} poFreightName={poFreightName} freightName={freightName} onReceived={openReprice} />
            ))}
          </TableBody>
        </Table>
        {lines.length === 0 && <p className="p-6 text-center text-muted-foreground">No lines yet. Add what this order is buying.</p>}
        {lines.length > 0 && (
          <div className="flex justify-end border-t border-border px-4 py-2 text-sm">
            <span className="text-muted-foreground">Total landed&nbsp;</span>
            <span className="font-heading font-bold tabular-nums">{formatPKR(grandLanded)}</span>
          </div>
        )}
      </div>

      {repriceItems.length > 0 && <RepricePanel items={repriceItems} editable={editable} onReprice={openReprice} />}

      {editable && po.status !== "cancelled" && <AddLine poId={po.id} freightVendors={freightVendors} poFreightName={poFreightName} />}

      {/* Reprice prompt — pops automatically after a receive, and from the panel's Reprice buttons. */}
      <RepriceDialog productId={currentRepriceId} onClose={() => setRepriceQueue((q) => q.slice(1))} />
    </div>
  );
}

interface RepriceItem { id: string; name: string; cost: number | null; retail: number | null; reseller: number | null }

const markupOf = (price: number | null, cost: number | null) => (cost != null && cost > 0 && price != null ? (price - cost) / cost : null);
// Tone for a markup: red at/below cost (a loss), amber when thin, green otherwise. Purely a visual
// cue — there's no hard threshold that blocks anything.
const markupTone = (m: number | null) => (m == null ? "text-muted-foreground" : m <= 0 ? "text-[#cc0000]" : m < 0.3 ? "text-amber-700" : "text-green-700");

// A selling price + the markup it yields on the current cost, stacked. "—" when no price is set.
function PriceMarkup({ price, cost }: { price: number | null; cost: number | null }) {
  if (price == null) return <span className="text-muted-foreground">—</span>;
  const m = markupOf(price, cost);
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="tabular-nums">{formatPKR(price)}</span>
      {m != null && <span className={cn("text-[11px] tabular-nums", markupTone(m))}>{(m * 100).toFixed(0)}% markup</span>}
    </div>
  );
}

// After a receive, the restocked products' costs have moved. Show cost + prices + current markup,
// with a reprice action. Consistent with the catalogue (same weighted-average cost basis).
export function RepricePanel({ items, editable, onReprice }: { items: RepriceItem[]; editable: boolean; onReprice: (id: string) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 [font-family:var(--font-heading)] text-lg uppercase tracking-wide">
        <Tag className="size-5 text-[#cc0000]" /> Review pricing
      </h2>
      <p className="text-sm text-muted-foreground">
        New stock landed, so each product&apos;s cost has moved. Check the markup your prices now yield and reprice if needed. Nothing changes until you save.
      </p>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <TableHead className="text-white">Product</TableHead>
              <TableHead className="text-right text-white">Cost / unit</TableHead>
              <TableHead className="text-right text-white">Retail</TableHead>
              <TableHead className="text-right text-white">Reseller</TableHead>
              {editable && <TableHead className="w-24 text-white" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.name}</TableCell>
                <TableCell className="text-right tabular-nums">{it.cost != null ? formatPKR(it.cost) : "—"}</TableCell>
                <TableCell className="text-right"><PriceMarkup price={it.retail} cost={it.cost} /></TableCell>
                <TableCell className="text-right"><PriceMarkup price={it.reseller} cost={it.cost} /></TableCell>
                {editable && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => onReprice(it.id)}>Reprice</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

// Reprice a product against its new cost, with live markup feedback as you type. Self-sufficient:
// it reads the CURRENT product (so it shows the post-receive cost after the refetch lands) and
// prefills once per target — a background refetch won't wipe what the operator is typing. Saves
// retail + reseller together (reseller must stay at/below retail). The operator stays in control.
export function RepriceDialog({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const productsQ = useProducts();
  const update = useUpdateProductPrice();
  const product = (productsQ.data ?? []).find((p) => p.id === productId) ?? null;
  const [retail, setRetail] = useState("");
  const [reseller, setReseller] = useState("");

  useEffect(() => {
    if (!productId) return;
    const p = (productsQ.data ?? []).find((x) => x.id === productId);
    setRetail(p?.price_pkr != null ? String(p.price_pkr) : "");
    setReseller(p?.reseller_price_pkr != null ? String(p.reseller_price_pkr) : "");
    // Prefill only when the TARGET changes — deliberately not depending on productsQ.data, so a
    // background refetch (e.g. the new cost landing) doesn't reset the operator's typed prices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const cost = product?.weighted_avg_cost_pkr ?? null;
  const retailNum = retail.trim() ? Number(retail) : null;
  const resellerNum = reseller.trim() ? Number(reseller) : null;
  const resellerTooHigh = retailNum != null && resellerNum != null && resellerNum > retailNum;

  async function submit() {
    if (!productId) return;
    if (retailNum == null || !Number.isFinite(retailNum) || retailNum < 0) return toast.error("Enter a retail price");
    if (resellerTooHigh) return toast.error("Reseller price must be at or below the retail price");
    try {
      await update.mutateAsync({
        id: productId,
        price_pkr: Math.round(retailNum),
        reseller_price_pkr: resellerNum != null ? Math.round(resellerNum) : null,
      });
      toast.success("Price updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the price");
    }
  }

  const retailMarkup = markupOf(retailNum, cost);
  const resellerMarkup = markupOf(resellerNum, cost);

  return (
    <Dialog open={!!productId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reprice: {product?.name ?? "product"}</DialogTitle>
          <DialogDescription>
            Cost is now <span className="font-medium text-foreground">{cost != null ? formatPKR(cost) : "—"}</span> / unit. Set prices to the markup you want — the figures update as you type.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Retail price (PKR)</Label>
            <Input type="number" min={0} aria-label="Retail price" value={retail} onChange={(e) => setRetail(e.target.value)} />
            <p className={cn("text-xs tabular-nums", markupTone(retailMarkup))}>
              {retailMarkup != null ? `${(retailMarkup * 100).toFixed(0)}% markup` : "Set a cost + price to see the markup"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Reseller price (PKR) <span className="text-muted-foreground">(optional)</span></Label>
            <Input type="number" min={0} aria-label="Reseller price" value={reseller} onChange={(e) => setReseller(e.target.value)} />
            {resellerTooHigh ? (
              <p className="text-xs font-medium text-[#cc0000]">Reseller must be at or below retail.</p>
            ) : (
              <p className={cn("text-xs tabular-nums", markupTone(resellerMarkup))}>
                {resellerMarkup != null ? `${(resellerMarkup * 100).toFixed(0)}% markup` : " "}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={update.isPending || resellerTooHigh}>
            {update.isPending ? "Saving…" : "Save price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Air/sea vendor option for the pickers, and a resolver for names.
type FreightVendor = { id: string; name: string; role: "air_freight" | "sea_freight"; active: boolean };
// Select sentinel for a line that inherits the PO's freight vendor (freight_vendor_id = null).
const PO_DEFAULT_FREIGHT = "po-default";

function LineRow({ poId, line, rate, editable, vendorAccountId, credit, freightVendors, poFreightName, freightName, onReceived }: {
  poId: string; line: POLine; rate: number | null; editable: boolean; vendorAccountId: string | null; credit: number;
  freightVendors: FreightVendor[]; poFreightName: string | null; freightName: (vid: string | null) => string | null;
  onReceived: (productId: string) => void;
}) {
  const receive = useReceivePOLine(poId);
  const pay = useRecordPOPayment(poId);
  const del = useDeletePOLine(poId);
  const updateLine = useUpdatePOLine(poId);
  const { landedPerUnit, landedTotal } = lineLanded(line, rate);
  const outstanding = line.qty_ordered - line.qty_received;
  const [qty, setQty] = useState(String(outstanding));
  const [editKind, setEditKind] = useState<"item" | "ship" | null>(null);
  const [payAmt, setPayAmt] = useState("");

  const itemCost = Math.round(line.qty_ordered * line.unit_cost_rmb * (rate ?? 0));
  const shipCost = Math.round(line.qty_ordered * line.shipping_per_unit_pkr);

  // Record how much was paid (NEW money). The RPC computes cost server-side, refunds any credit that
  // funded a prior payment, banks item over-payment as credit, and updates the line — atomically.
  async function savePayment(kind: "item" | "ship") {
    if (kind === "item" && rate == null) return toast.error("Set the PO's RMB rate before paying for items.");
    try {
      await pay.mutateAsync({ line_id: line.id, kind, amount_pkr: Math.round(Number(payAmt) || 0), use_credit: false, occurred_on: today() });
      setEditKind(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save payment");
    }
  }

  // Settle a kind's remaining balance from the vendor's existing credit (a draw-down) — atomic.
  async function payWithCredit(kind: "item" | "ship") {
    if (!vendorAccountId) return;
    try {
      await pay.mutateAsync({ line_id: line.id, kind, amount_pkr: 0, use_credit: true, occurred_on: today() });
      toast.success("Paid from vendor credit");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply credit");
    }
  }

  async function doReceive() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) return toast.error("Enter a whole quantity");
    if (n > outstanding) return toast.error(`Only ${outstanding} outstanding on this line`);
    try {
      await receive.mutateAsync({ line_id: line.id, qty: n, received_on: today() });
      toast.success(`Received ${n} → batch created`);
      setQty(String(outstanding - n)); // reflect the new outstanding for a partial receipt
      if (line.product_id) onReceived(line.product_id); // new stock → prompt to review this product's price
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not receive");
    }
  }

  // A render helper, NOT a nested component: called inline as {paidCell(...)} so its JSX reconciles by
  // position within LineRow. Declaring it as a component and rendering <PaidCell/> gives it a fresh
  // identity every LineRow render, remounting the amount <Input> on each keystroke (cursor jumps).
  const paidCell = (kind: "item" | "ship") => {
    const cost = kind === "item" ? itemCost : shipCost;
    const amount = (kind === "item" ? line.item_paid_amount_pkr : line.ship_paid_amount_pkr) ?? 0;
    const on = kind === "item" ? line.item_paid_on : line.ship_paid_on;
    const extra = kind === "item" ? (line.item_credit_added_pkr ?? 0) : 0;
    const remaining = Math.max(0, cost - amount);
    const canUseCredit = !!vendorAccountId && credit >= remaining && remaining > 0;
    const typed = Number(payAmt) || 0;
    const rateMissing = kind === "item" && rate == null; // item cost needs the frozen RMB rate

    if (editKind === kind) {
      return (
        <div className="flex flex-col items-start gap-1">
          <Input type="number" min={0} value={payAmt} autoFocus onChange={(e) => setPayAmt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePayment(kind)} className="h-7 w-24" />
          <span className="text-[10px] text-muted-foreground">of {formatPKR(cost)}</span>
          {kind === "item" && typed > cost && <span className="text-[11px] font-medium text-green-700">+{formatPKR(typed - cost)} credit</span>}
          <div className="flex gap-1">
            <Button size="sm" className="h-6 bg-[#cc0000] px-2 text-[11px] text-white hover:bg-[#a30000]" onClick={() => savePayment(kind)}>Save</Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditKind(null)}>Cancel</Button>
          </div>
        </div>
      );
    }
    return on ? (
      <button type="button" disabled={!editable} onClick={() => { setEditKind(kind); setPayAmt(String(amount || cost)); }} className="text-left">
        <span className="text-green-700">✓ {formatPKR(amount)}</span>
        {extra > 0 && <span className="block text-[11px] text-green-700">+{formatPKR(extra)} credit</span>}
        {remaining > 0 && <span className="block text-[11px] text-amber-700">{formatPKR(remaining)} left</span>}
        <span className="block text-xs text-muted-foreground">{formatDate(on)}</span>
      </button>
    ) : (
      <div className="flex flex-col items-start gap-0.5">
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!editable || rateMissing} title={rateMissing ? "Set the RMB rate first" : undefined} onClick={() => { setEditKind(kind); setPayAmt(String(cost)); }}>Enter amount</Button>
        {editable && !rateMissing && canUseCredit && (
          <button type="button" className="text-[11px] font-medium text-green-700 hover:underline disabled:opacity-50" disabled={pay.isPending} onClick={() => payWithCredit(kind)}>
            Use credit
          </button>
        )}
      </div>
    );
  };

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{line.products?.name ?? "—"}</p>
        <p className="font-mono text-xs text-muted-foreground">{line.products?.sku}</p>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{line.qty_received} / {line.qty_ordered}</TableCell>
      <TableCell className="text-right tabular-nums">¥{line.unit_cost_rmb}</TableCell>
      <TableCell className="text-right tabular-nums">{rate != null ? formatPKR(landedPerUnit) : "—"}</TableCell>
      <TableCell className="text-right tabular-nums">{rate != null ? formatPKR(landedTotal) : "—"}</TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {editable ? (
          <Select
            value={line.freight_vendor_id ?? PO_DEFAULT_FREIGHT}
            onValueChange={(v) => updateLine.mutate({ id: line.id, freight_vendor_id: v === PO_DEFAULT_FREIGHT ? null : v })}
          >
            <SelectTrigger className="h-8 w-36" aria-label="Freight vendor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={PO_DEFAULT_FREIGHT}>PO default{poFreightName ? ` (${poFreightName})` : ""}</SelectItem>
              {freightVendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {VENDOR_ROLE_LABEL[v.role]}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground">{freightName(line.freight_vendor_id) ?? (poFreightName ? `${poFreightName} (PO)` : "—")}</span>
        )}
      </TableCell>
      <TableCell>{paidCell("item")}</TableCell>
      <TableCell>{paidCell("ship")}</TableCell>
      <TableCell>
        {outstanding <= 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-700"><PackageCheck className="size-3.5" /> received</span>
        ) : editable ? (
          <div className="flex items-center gap-1">
            <Input type="number" min={1} max={outstanding} value={qty} onChange={(e) => setQty(e.target.value)} className="h-7 w-16" />
            <Button size="sm" className="h-7 bg-[#cc0000] text-xs text-white hover:bg-[#a30000]" disabled={receive.isPending || rate == null} onClick={doReceive}>Receive</Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{outstanding} due</span>
        )}
      </TableCell>
      <TableCell>
        {editable && line.qty_received === 0 && (
          <Button variant="ghost" size="icon" className="size-8" title="Remove line" onClick={() => del.mutate(line.id)}>
            <Trash2 className="size-4 text-[#cc0000]" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function AddLine({ poId, freightVendors, poFreightName }: { poId: string; freightVendors: FreightVendor[]; poFreightName: string | null }) {
  const productsQ = useProducts();
  const add = useAddPOLine();
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [unitRmb, setUnitRmb] = useState("");
  const [ship, setShip] = useState("");
  const [pkg, setPkg] = useState("");
  const [freightId, setFreightId] = useState(PO_DEFAULT_FREIGHT);
  const products = useMemo(() => productsQ.data ?? [], [productsQ.data]);

  // The catalogue can be empty (no products created yet). A Radix Select with zero items
  // has nothing to open — which reads as "the picker won't open". Show a clear next step.
  if (!productsQ.isLoading && products.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
        No products in the catalogue yet. Add one in{" "}
        <Link to="/products" className="font-medium text-[#cc0000] hover:underline">Catalogue</Link>{" "}
        first, then add it as a line on this PO.
      </div>
    );
  }

  async function submit() {
    if (!productId) return toast.error("Choose a product");
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) return toast.error("Enter a whole quantity");
    try {
      await add.mutateAsync({
        purchase_order_id: poId,
        product_id: productId,
        qty_ordered: q,
        unit_cost_rmb: Number(unitRmb) || 0,
        shipping_per_unit_pkr: Number(ship) || 0,
        packaging_per_unit_pkr: Number(pkg) || 0,
        freight_vendor_id: freightId === PO_DEFAULT_FREIGHT ? null : freightId,
      });
      toast.success("Line added");
      setProductId("");
      setQty("");
      setUnitRmb("");
      setShip("");
      setPkg("");
      setFreightId(PO_DEFAULT_FREIGHT);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add line");
    }
  }

  return (
    <div className="rounded-md border border-dashed border-border bg-secondary/20 p-4">
      <p className="mb-3 font-heading text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Add a line</p>
      <div className="grid items-end gap-3 sm:grid-cols-6">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Product</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger aria-label="Product"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Qty</Label><Input aria-label="Qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Unit (RMB)</Label><Input type="number" min={0} value={unitRmb} onChange={(e) => setUnitRmb(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Ship/unit (PKR)</Label><Input type="number" min={0} value={ship} onChange={(e) => setShip(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Pkg/unit (PKR)</Label><Input type="number" min={0} value={pkg} onChange={(e) => setPkg(e.target.value)} /></div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Freight vendor <span className="text-muted-foreground">(sea / air)</span></Label>
          <Select value={freightId} onValueChange={setFreightId}>
            <SelectTrigger aria-label="Freight vendor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={PO_DEFAULT_FREIGHT}>PO default{poFreightName ? ` (${poFreightName})` : ""}</SelectItem>
              {freightVendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {VENDOR_ROLE_LABEL[v.role]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" disabled={add.isPending || !productId} onClick={submit}>
          <Plus className="size-4" /> Add line
        </Button>
      </div>
    </div>
  );
}
