// Customer delivery costs — an IMMUTABLE ledger of last-mile courier bills to send orders to
// customers. Each entry has an owed→paid state (so "payments owed" to couriers is visible) and
// can be backdated for late bills. Reduces profit (operating expense). Entries are never edited
// or deleted — mark an owed one paid, or reverse a mistake. Local/inbound shipping is NOT here —
// that stays in product landed cost. Lives in Data Management → Delivery.
import { useEffect, useState } from "react";
import { Check, Plus, Undo2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useDeliveries,
  useCreateDelivery,
  useReverseDelivery,
  useMarkDeliveryPaid,
  type DeliveryRow,
  type DeliveryInput,
} from "../../data/deliveries";
import { useOrders } from "../../data/orders";
import { useAuth } from "../../data/auth";
import { formatPKR, formatDate } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import { useTableSort, SortHead } from "../common/useTableSort";
import { useConfirm } from "../common/confirm";

function today() { return new Date().toISOString().slice(0, 10); }

export function DeliveriesManager() {
  const deliveriesQ = useDeliveries();
  const rev = useReverseDelivery();
  const markPaid = useMarkDeliveryPaid();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const confirm = useConfirm();

  const rows = deliveriesQ.data ?? [];
  const reversedIds = new Set(rows.map((r) => r.reverses_id).filter(Boolean) as string[]);
  // Still owed = unpaid originals that haven't been reversed.
  const owed = rows.filter((r) => !r.reverses_id && !r.paid_on && !reversedIds.has(r.id)).reduce((s, r) => s + Number(r.amount_pkr), 0);
  const term = q.trim().toLowerCase();
  const filtered = rows.filter((r) => !term || (r.courier ?? "").toLowerCase().includes(term) || (r.orders?.order_no ?? "").toLowerCase().includes(term) || (r.note ?? "").toLowerCase().includes(term));
  const sort = useTableSort(filtered, {
    date: (r) => r.billed_on,
    amount: (r) => r.amount_pkr,
    courier: (r) => r.courier,
    order: (r) => r.orders?.order_no ?? null,
    status: (r) => (r.paid_on ? 1 : 0),
    note: (r) => r.note,
  }, "date", "desc");

  async function paid(r: DeliveryRow) {
    try {
      await markPaid.mutateAsync(r.id);
      toast.success("Marked as paid");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    }
  }
  async function reverse(r: DeliveryRow) {
    if (!(await confirm({ title: `Reverse this delivery cost of ${formatPKR(r.amount_pkr)}?`, description: "This posts a matching reversal that cancels it out. The original stays on the ledger.", destructive: true }))) return;
    try {
      await rev.mutateAsync(r);
      toast.success("Delivery cost reversed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reverse");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Courier cost to deliver an order to a customer. Owed until you mark it paid. Late bills? Add it with its real date.
          Owed to couriers: <span className="font-medium text-foreground tabular-nums">{formatPKR(owed)}</span>.
        </p>
        {can("edit") && (
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Record Delivery Cost
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by courier, order, or note…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <SortHead label="Date" sortKey="date" sort={sort} className="text-white" />
              <SortHead label="Amount" sortKey="amount" sort={sort} className="text-white" />
              <SortHead label="Courier" sortKey="courier" sort={sort} className="text-white" />
              <SortHead label="Order" sortKey="order" sort={sort} className="text-white" />
              <SortHead label="Status" sortKey="status" sort={sort} className="text-white" />
              <SortHead label="Note" sortKey="note" sort={sort} className="text-white" />
              <TableHead className="text-white w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sort.sorted.map((r) => {
              const isReversal = r.reverses_id !== null;
              const isReversed = reversedIds.has(r.id);
              return (
                <TableRow key={r.id} className={isReversal || isReversed ? "opacity-60" : undefined}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.billed_on)}</TableCell>
                  <TableCell className={`tabular-nums ${r.amount_pkr < 0 ? "text-emerald-600" : "text-[#cc0000]"}`}>{formatPKR(r.amount_pkr)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.courier ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.orders?.order_no ?? "—"}</TableCell>
                  <TableCell>
                    {isReversal ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", r.paid_on ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                        {r.paid_on ? "Paid" : "Owed"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{r.note}</TableCell>
                  <TableCell>
                    {isReversal ? (
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Reversal</span>
                    ) : isReversed ? (
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Reversed</span>
                    ) : can("edit") ? (
                      <div className="flex gap-1">
                        {!r.paid_on && (
                          <Button variant="ghost" size="icon" className="size-8" title="Mark as paid" onClick={() => paid(r)}>
                            <Check className="size-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-8" title="Reverse" onClick={() => reverse(r)}>
                          <Undo2 className="size-4 text-[#cc0000]" />
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {deliveriesQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
        {deliveriesQ.isError && <p className="p-6 text-center text-[#cc0000]">{(deliveriesQ.error as Error).message}</p>}
        {!deliveriesQ.isLoading && rows.length === 0 && <p className="p-6 text-center text-muted-foreground">No delivery costs logged yet.</p>}
      </div>

      <DeliveryDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function DeliveryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateDelivery();
  const ordersQ = useOrders();
  const [amount, setAmount] = useState("");
  const [billedOn, setBilledOn] = useState("");
  const [courier, setCourier] = useState("");
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(false);
  const [key, setKey] = useState(0);

  // Reset to blank on open. Must be an effect, not onOpenChange: the parent opens by flipping
  // `open`, and Radix fires onOpenChange only on user-driven close — so the form would otherwise
  // keep previously-typed values.
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setBilledOn("");
    setCourier("");
    setOrderId("");
    setNote("");
    setPaid(false);
    setKey((k) => k + 1);
  }, [open]);

  async function submit() {
    const input: DeliveryInput = {
      amount_pkr: Number(amount),
      billed_on: billedOn || today(),
      paid_on: paid ? today() : null,
      order_id: orderId || null,
      courier: courier.trim() || null,
      note: note.trim() || null,
    };
    try {
      await create.mutateAsync(input);
      toast.success("Delivery cost recorded");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save delivery cost");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" key={key}>
        <DialogHeader>
          <DialogTitle>Record delivery cost</DialogTitle>
          <DialogDescription>Courier cost to send an order to a customer. Reduces profit; owed until marked paid.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Amount (PKR)</Label><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>Bill date</Label><Input type="date" value={billedOn} onChange={(e) => setBilledOn(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Courier <span className="text-muted-foreground">(optional)</span></Label><Input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. TCS, Leopard" /></div>
          <div className="space-y-2">
            <Label>Order <span className="text-muted-foreground">(optional)</span></Label>
            <Select value={orderId || "none"} onValueChange={(v) => setOrderId(v === "none" ? "" : v)}>
              <SelectTrigger aria-label="Order"><SelectValue placeholder="Link an order" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked order</SelectItem>
                {(ordersQ.data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.order_no} · {o.customers?.name ?? "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Note <span className="text-muted-foreground">(optional)</span></Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. COD return leg" /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-4 accent-[#cc0000]" />
            Already paid to the courier
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={create.isPending || !amount}>
            {create.isPending ? "Saving…" : "Record delivery cost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
