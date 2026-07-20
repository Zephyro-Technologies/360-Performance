// Refunds tracker — a standalone log of out-of-pocket money sent back (damaged goods,
// goodwill, cash returned). Every entry carries a MANDATORY note and a deduction-cycle
// toggle (this month / carry to next month). Distinct from the per-order "reverse a
// payment" correction on an order — this is a fresh cash outflow. Lives in Data Management.
import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useRefunds,
  useSaveRefund,
  useDeleteRefund,
  REFUND_CYCLE_LABEL,
  type RefundRow,
  type RefundInput,
  type RefundCycle,
} from "../../data/refunds";
import { useOrders } from "../../data/orders";
import { useAuth } from "../../data/auth";
import { formatPKR, formatDate } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import { useTableSort, SortHead } from "../common/useTableSort";

export function RefundsManager() {
  const refundsQ = useRefunds();
  const del = useDeleteRefund();
  const { can } = useAuth();
  const [edit, setEdit] = useState<RefundRow | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  function openNew() { setEdit(null); setOpen(true); }
  function openEdit(r: RefundRow) { setEdit(r); setOpen(true); }
  async function remove(r: RefundRow) {
    if (!confirm(`Delete this refund of ${formatPKR(r.amount_pkr)}?`)) return;
    try {
      await del.mutateAsync(r.id);
      toast.success("Refund deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  const term = q.trim().toLowerCase();
  const refunds = (refundsQ.data ?? []).filter((r) => !term || (r.reason ?? "").toLowerCase().includes(term) || (r.orders?.order_no ?? "").toLowerCase().includes(term) || (REFUND_CYCLE_LABEL[r.deduction_cycle] ?? "").toLowerCase().includes(term));
  const sort = useTableSort(refunds, {
    date: (r) => r.refunded_on,
    amount: (r) => r.amount_pkr,
    deducts: (r) => REFUND_CYCLE_LABEL[r.deduction_cycle],
    reason: (r) => r.reason,
    order: (r) => r.orders?.order_no ?? null,
  }, "date", "desc");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Money you sent back out of pocket: damaged goods, goodwill, cash returned. Every entry needs a note.
          To undo a recorded customer payment instead, use <span className="font-medium text-foreground">Refund (reverse a payment)</span> on the order.
        </p>
        {can("edit") && (
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={openNew}>
            <Plus className="size-4" /> Record Refund
          </Button>
        )}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by reason, order, or cycle…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <SortHead label="Date" sortKey="date" sort={sort} className="text-white" />
              <SortHead label="Amount" sortKey="amount" sort={sort} className="text-white" />
              <SortHead label="Deducts" sortKey="deducts" sort={sort} className="text-white" />
              <SortHead label="Reason" sortKey="reason" sort={sort} className="text-white" />
              <SortHead label="Order" sortKey="order" sort={sort} className="text-white" />
              <TableHead className="text-white w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sort.sorted.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.refunded_on)}</TableCell>
                <TableCell className="tabular-nums text-[#cc0000]">{formatPKR(r.amount_pkr)}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium">{REFUND_CYCLE_LABEL[r.deduction_cycle]}</span>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">{r.reason}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.orders?.order_no ?? "—"}</TableCell>
                <TableCell>
                  {can("edit") && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>
                      {can("delete") && <Button variant="ghost" size="icon" className="size-8" onClick={() => remove(r)}><Trash2 className="size-4 text-[#cc0000]" /></Button>}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {refundsQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
        {refundsQ.isError && <p className="p-6 text-center text-[#cc0000]">{(refundsQ.error as Error).message}</p>}
        {!refundsQ.isLoading && refunds.length === 0 && <p className="p-6 text-center text-muted-foreground">No refunds logged yet.</p>}
      </div>

      <RefundDialog refund={edit} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function RefundDialog({ refund, open, onOpenChange }: { refund: RefundRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveRefund();
  const ordersQ = useOrders();
  const [amount, setAmount] = useState("");
  const [refundedOn, setRefundedOn] = useState("");
  const [cycle, setCycle] = useState<RefundCycle>("current");
  const [reason, setReason] = useState("");
  const [orderId, setOrderId] = useState("");
  const [key, setKey] = useState(0);

  // Reset the form to the row being edited (or blank) whenever the dialog opens. This MUST be an
  // effect, not the Dialog's onOpenChange: the dialog is opened by the parent flipping `open`, and
  // Radix only fires onOpenChange on user-driven close events — so a change handler never runs on
  // open, and the form would keep (and save) the previously-typed values against this row.
  useEffect(() => {
    if (!open) return;
    setAmount(refund ? String(refund.amount_pkr) : "");
    setRefundedOn(refund?.refunded_on ?? "");
    setCycle(refund?.deduction_cycle ?? "current");
    setReason(refund?.reason ?? "");
    setOrderId(refund?.order_id ?? "");
    setKey((k) => k + 1);
  }, [refund, open]);

  async function submit() {
    const input: RefundInput = {
      amount_pkr: Number(amount),
      refunded_on: refundedOn || new Date().toISOString().slice(0, 10),
      deduction_cycle: cycle,
      reason: reason.trim(),
      order_id: orderId || null,
    };
    try {
      await save.mutateAsync({ id: refund?.id, input });
      toast.success(refund ? "Refund updated" : "Refund recorded");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save refund");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" key={key}>
        <DialogHeader>
          <DialogTitle>{refund ? "Edit refund" : "Record refund"}</DialogTitle>
          <DialogDescription>Cash sent back out of pocket. It lowers your profit and this period&apos;s money out.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Amount (PKR)</Label><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={refundedOn} onChange={(e) => setRefundedOn(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Deduct from</Label>
            <Select value={cycle} onValueChange={(v) => setCycle(v as RefundCycle)}>
              <SelectTrigger aria-label="Deduction cycle"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">This month</SelectItem>
                <SelectItem value="next">Next month (carry forward)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Use “Next month” if this month&apos;s profit was already split, so the deduction isn&apos;t lost.</p>
          </div>
          <div className="space-y-2">
            <Label>Reason <span className="text-[#cc0000]">*</span></Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. items arrived damaged, refunded the customer" />
          </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={save.isPending || !amount || !reason.trim()}>
            {save.isPending ? "Saving…" : refund ? "Save changes" : "Record refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
