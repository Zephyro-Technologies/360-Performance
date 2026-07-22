// Marketing — the combined PR Gifts log + Cash Marketing ledger. Both feed the marketing total
// that "What you kept" subtracts. PR gifts give away HOUSE stock (drawn FIFO at landed cost);
// cash marketing is pure spend. Internal.
import { useEffect, useMemo, useState } from "react";
import { Plus, Gift, Banknote, Undo2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useMarketingSpend,
  usePrGifts,
  useGiftPr,
  useUpdatePrGift,
  useCashMarketing,
  useAddCashMarketing,
  useReverseCashMarketing,
  type CashMarketing,
  MARKETING_TYPE_LABEL,
  PR_STATUS_LABEL,
  PR_STATUS_FLOW,
  type MarketingType,
  type PrStatus,
} from "../../data/marketing";
import { useProducts } from "../../data/catalog";
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
import { useConfirm } from "../common/confirm";

export function MarketingManager() {
  const spendQ = useMarketingSpend();
  const { can } = useAuth();
  const [giftOpen, setGiftOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const s = spendQ.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-card p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total marketing</p>
          <p className="[font-family:var(--font-heading)] text-2xl font-bold tabular-nums">{formatPKR(s?.total_pkr ?? 0)}</p>
          <p className="text-xs text-muted-foreground">subtracted from "What you kept"</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">PR gifts (inventory)</p>
          <p className="text-lg font-semibold tabular-nums">{formatPKR(s?.pr_gift_pkr ?? 0)}</p>
          <p className="text-xs text-muted-foreground">landed cost of gifted stock</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cash marketing</p>
          <p className="text-lg font-semibold tabular-nums">{formatPKR(s?.cash_pkr ?? 0)}</p>
          <p className="text-xs text-muted-foreground">sponsorships / promos / discounts</p>
        </div>
      </div>

      <PrGiftsSection canEdit={can("edit")} onRecord={() => setGiftOpen(true)} />
      <CashSection canEdit={can("edit")} onAdd={() => setCashOpen(true)} />

      <RecordGiftDialog open={giftOpen} onOpenChange={setGiftOpen} />
      <CashDialog open={cashOpen} onOpenChange={setCashOpen} />
    </div>
  );
}

function PrGiftsSection({ canEdit, onRecord }: { canEdit: boolean; onRecord: () => void }) {
  const giftsQ = usePrGifts();
  const update = useUpdatePrGift();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const gifts = (giftsQ.data ?? []).filter((g) => !term || (g.products?.name ?? "").toLowerCase().includes(term) || (g.recipient ?? "").toLowerCase().includes(term) || (g.platform ?? "").toLowerCase().includes(term));
  const sort = useTableSort(gifts, {
    date: (g) => g.occurred_on,
    item: (g) => g.products?.name ?? null,
    qty: (g) => g.qty,
    landed: (g) => g.landed_cost_pkr,
    recipient: (g) => g.recipient,
    platform: (g) => g.platform,
    status: (g) => g.status,
  }, "date", "desc");


  async function setStatus(id: string, status: PrStatus) {
    try { await update.mutateAsync({ id, status }); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update"); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 [font-family:var(--font-heading)] uppercase tracking-wide"><Gift className="size-4 text-[#cc0000]" /> PR gifts</h2>
        {canEdit && <Button size="sm" className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={onRecord}><Plus className="size-4" /> Record PR gift</Button>}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by item, recipient, or platform…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <SortHead label="Date" sortKey="date" sort={sort} className="text-white whitespace-nowrap" />
              <SortHead label="Item" sortKey="item" sort={sort} className="text-white whitespace-nowrap" />
              <SortHead label="Qty" sortKey="qty" sort={sort} className="text-right text-white whitespace-nowrap" align="right" />
              <SortHead label="Landed cost" sortKey="landed" sort={sort} className="text-right text-white whitespace-nowrap" align="right" />
              <SortHead label="Recipient" sortKey="recipient" sort={sort} className="text-white whitespace-nowrap" />
              <SortHead label="Platform" sortKey="platform" sort={sort} className="text-white whitespace-nowrap" />
              <SortHead label="Status" sortKey="status" sort={sort} className="text-white whitespace-nowrap" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sort.sorted.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(g.occurred_on)}</TableCell>
                <TableCell>
                  <p className="font-medium">{g.products?.name ?? "—"}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{g.products?.sku ?? ""}{g.content_type ? ` · ${g.content_type}` : ""}{g.expected_reach ? ` · ~${g.expected_reach.toLocaleString()} reach` : ""}</p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{g.qty}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(g.landed_cost_pkr)}</TableCell>
                <TableCell>{g.recipient ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{g.platform ?? "—"}</TableCell>
                <TableCell>
                  {canEdit ? (
                    <Select value={g.status} onValueChange={(v) => setStatus(g.id, v as PrStatus)}>
                      <SelectTrigger className="h-8 w-32" aria-label="PR status"><SelectValue /></SelectTrigger>
                      <SelectContent>{PR_STATUS_FLOW.map((st) => <SelectItem key={st} value={st}>{PR_STATUS_LABEL[st]}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : PR_STATUS_LABEL[g.status]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {giftsQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
        {!giftsQ.isLoading && gifts.length === 0 && <p className="p-6 text-center text-muted-foreground">No PR gifts yet.</p>}
      </div>
    </div>
  );
}

function CashSection({ canEdit, onAdd }: { canEdit: boolean; onAdd: () => void }) {
  const cashQ = useCashMarketing();
  const rev = useReverseCashMarketing();
  const confirm = useConfirm();
  const rows = cashQ.data ?? [];
  const reversedIds = new Set(rows.map((r) => r.reverses_id).filter(Boolean) as string[]);
  const sort = useTableSort(rows, {
    date: (r) => r.spent_on,
    type: (r) => MARKETING_TYPE_LABEL[r.kind],
    amount: (r) => r.amount_pkr,
    recipient: (r) => r.recipient,
    note: (r) => r.note,
  }, "date", "desc");

  async function reverse(r: CashMarketing) {
    if (!(await confirm({ title: `Reverse this ${formatPKR(r.amount_pkr)} marketing spend?`, description: "This posts a matching reversal that cancels it out. The original stays on the ledger.", destructive: true }))) return;
    try { await rev.mutateAsync(r); toast.success("Reversed"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not reverse"); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 [font-family:var(--font-heading)] uppercase tracking-wide"><Banknote className="size-4 text-[#cc0000]" /> Cash marketing</h2>
        {canEdit && <Button size="sm" className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={onAdd}><Plus className="size-4" /> Add cash marketing</Button>}
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <SortHead label="Date" sortKey="date" sort={sort} className="text-white whitespace-nowrap" />
              <SortHead label="Type" sortKey="type" sort={sort} className="text-white whitespace-nowrap" />
              <SortHead label="Amount" sortKey="amount" sort={sort} className="text-right text-white" align="right" />
              <SortHead label="Recipient" sortKey="recipient" sort={sort} className="text-white whitespace-nowrap" />
              <SortHead label="Note" sortKey="note" sort={sort} className="text-white whitespace-nowrap" />
              <TableHead className="w-px text-white"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sort.sorted.map((r) => {
              const isReversal = r.reverses_id !== null;
              const isReversed = reversedIds.has(r.id);
              return (
                <TableRow key={r.id} className={isReversal || isReversed ? "opacity-60" : undefined}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.spent_on)}</TableCell>
                  <TableCell>{MARKETING_TYPE_LABEL[r.kind]}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.amount_pkr < 0 ? "text-emerald-600" : ""}`}>{formatPKR(r.amount_pkr)}</TableCell>
                  <TableCell>{r.recipient ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{r.note ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {isReversal ? (
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Reversal</span>
                    ) : isReversed ? (
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Reversed</span>
                    ) : canEdit ? (
                      <Button variant="ghost" size="icon" className="size-8" title="Reverse" onClick={() => reverse(r)}><Undo2 className="size-4 text-[#cc0000]" /></Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {cashQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
        {!cashQ.isLoading && rows.length === 0 && <p className="p-6 text-center text-muted-foreground">No cash marketing logged yet.</p>}
      </div>
    </div>
  );
}

function RecordGiftDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const productsQ = useProducts();
  const gift = useGiftPr();
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [platform, setPlatform] = useState("");
  const [content, setContent] = useState("");
  const [reach, setReach] = useState("");
  const [status, setStatus] = useState<PrStatus>("sent");
  const [notes, setNotes] = useState("");

  // PR gifts use house stock only, and only what's on hand.
  const eligible = useMemo(
    () => (productsQ.data ?? []).filter((p) => p.owner_kind === "house" && p.on_hand_qty > 0),
    [productsQ.data],
  );

  function reset() {
    setProductId(""); setQty("1"); setRecipient(""); setPlatform(""); setContent(""); setReach(""); setStatus("sent"); setNotes("");
  }

  // Clear any half-typed entry each time the dialog reopens (create-only, so no row to reload).
  useEffect(() => { if (open) reset(); }, [open]);

  async function submit() {
    if (!productId) return toast.error("Pick a product to gift");
    try {
      await gift.mutateAsync({
        product_id: productId,
        qty: Math.floor(Number(qty) || 0),
        recipient: recipient.trim() || null,
        platform: platform.trim() || null,
        content_type: content.trim() || null,
        expected_reach: reach.trim() ? Math.floor(Number(reach)) : null,
        status,
        notes: notes.trim() || null,
        occurred_on: null,
      });
      toast.success("PR gift recorded");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the gift");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record PR gift</DialogTitle>
          <DialogDescription>Gifting draws HOUSE stock at its landed cost (FIFO) and books it to marketing, never an investor's stock.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Product <span className="text-muted-foreground">(house stock)</span></Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger aria-label="Product"><SelectValue placeholder="Pick a product…" /></SelectTrigger>
              <SelectContent>{eligible.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku} ({p.on_hand_qty} on hand)</SelectItem>)}</SelectContent>
            </Select>
            {eligible.length === 0 && <p className="text-xs text-muted-foreground">No house products with stock on hand to gift.</p>}
          </div>
          <div className="space-y-2"><Label>Quantity</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="space-y-2"><Label>Expected reach</Label><Input type="number" min={0} value={reach} onChange={(e) => setReach(e.target.value)} placeholder="optional" /></div>
          <div className="space-y-2"><Label>Recipient</Label><Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Influencer / handle" /></div>
          <div className="space-y-2"><Label>Platform</Label><Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Instagram / YouTube…" /></div>
          <div className="space-y-2"><Label>Content type</Label><Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="reel / story / post…" /></div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PrStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PR_STATUS_FLOW.map((st) => <SelectItem key={st} value={st}>{PR_STATUS_LABEL[st]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={gift.isPending || !productId}>{gift.isPending ? "Recording…" : "Record gift"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useAddCashMarketing();
  const [kind, setKind] = useState<MarketingType>("paid_promo");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");

  // Clear any half-typed entry each time the dialog reopens (create-only).
  useEffect(() => {
    if (open) { setKind("paid_promo"); setAmount(""); setRecipient(""); setNote(""); }
  }, [open]);

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    try {
      await add.mutateAsync({ kind, amount_pkr: amt, recipient: recipient.trim() || null, note: note.trim() || null, spent_on: null });
      toast.success("Cash marketing added");
      setKind("paid_promo"); setAmount(""); setRecipient(""); setNote("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add cash marketing</DialogTitle>
          <DialogDescription>Pure marketing spend with no inventory.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as MarketingType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(MARKETING_TYPE_LABEL) as MarketingType[]).map((k) => <SelectItem key={k} value={k}>{MARKETING_TYPE_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Amount (PKR)</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Recipient</Label><Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Page / event / platform" /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={add.isPending}>{add.isPending ? "Adding…" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
