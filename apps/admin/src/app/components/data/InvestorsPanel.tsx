// Investor settlement panel (Investors page) — the P&L carve-out (linking to the full Profit
// breakdown) + the per-investor owed subledger + payouts.
// GUARDRAIL: what's owed to investors is a LIABILITY, never house
// profit; "What you kept" already excludes it (the house takes only its split). Mirrors the
// Vendor Advances panel discipline (a balance + manual ledger, zero double-count).
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, HandCoins, Undo2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  usePnlSummary,
  useInvestorOwed,
  useInvestorPayouts,
  useRecordPayout,
  useReversePayout,
  type InvestorOwed,
  type InvestorPayout,
} from "../../data/investors";
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
import { useConfirm } from "../common/confirm";

export function InvestorsPanel() {
  const pnlQ = usePnlSummary();
  const owedQ = useInvestorOwed();
  const ledgerQ = useInvestorPayouts();
  const reverse = useReversePayout();
  const { can } = useAuth();
  const [payoutOpen, setPayoutOpen] = useState(false);

  const owed = useMemo(() => owedQ.data ?? [], [owedQ.data]);
  const withActivity = owed.filter((o) => o.accrued_pkr > 0 || o.paid_out_pkr > 0);
  const totalOwed = owed.reduce((s, o) => s + o.owed_pkr, 0);
  const pnl = pnlQ.data;

  const confirm = useConfirm();

  async function doReverse(p: InvestorPayout) {
    if (!(await confirm({ title: `Reverse this payout of ${formatPKR(p.amount_pkr)}?`, description: "Posts a correcting entry — the original payout stays in the ledger.", confirmLabel: "Reverse", destructive: true }))) return;
    try {
      await reverse.mutateAsync(p);
      toast.success("Payout reversed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reverse");
    }
  }

  return (
    <section className="mt-8 border-t border-border pt-8">
      {/* Carve-out: the house's real profit, after the investor split */}
      {pnl && (
        <div className="mb-6 rounded-md border border-border bg-card p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="[font-family:var(--font-heading)] uppercase tracking-wide">Profit after the investor split</h2>
            <Link to="/insights/profit" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#cc0000] hover:underline">
              Full breakdown <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Investor sales put only YOUR split into profit. Their capital + their cut is owed to them, never counted as yours.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Gross margin" value={pnl.gross_margin_pkr} help="Sales − cost of the goods sold" />
            <Stat label="Your share (house)" value={pnl.house_margin_pkr} help="Your part of every sale's margin (investor sales = only your split)" />
            <Stat label="Operating expenses" value={-pnl.operating_expense_pkr} help="Marketing + operations + salaries + at-fault corrections + logged refunds + customer delivery" />
            <Stat label="What you kept" value={pnl.kept_pkr} help="Your share − operating expenses" highlight />
            <Stat label="incl. marketing" value={-pnl.marketing_pkr} help="PR-gift landed cost + cash marketing" tone="muted" />
            <Stat label="incl. at-fault" value={-pnl.corrections_pkr} help="Replacements + refunds + compensation (house absorbs its own errors)" tone="muted" />
            <Stat label="incl. refunds" value={-pnl.refunds_pkr} help="Out-of-pocket money-back log (Finance → Refunds)" tone="muted" />
            <Stat label="Investors' cut" value={pnl.investor_share_pkr} help="Their profit-share: owed to them, NOT your profit" tone="muted" />
          </div>
        </div>
      )}

      {/* Owed subledger */}
      <div className="rounded-md border border-border bg-secondary/30 p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 [font-family:var(--font-heading)] uppercase tracking-wide">
            <HandCoins className="size-4 text-muted-foreground" /> Investor Settlement
          </h2>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-background px-2.5 py-0.5 text-xs text-muted-foreground">owed to investors · not house profit</span>
            {can("edit") && (
              <Button size="sm" className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => setPayoutOpen(true)} disabled={withActivity.length === 0}>
                <Plus className="size-4" /> Record payout
              </Button>
            )}
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Capital + profit-share accrues as investor stock is delivered; pay it out when they ask. Total owed:{" "}
          <span className="font-medium text-foreground tabular-nums">{formatPKR(totalOwed)}</span>.
        </p>

        {owedQ.isError ? (
          <p className="py-6 text-center text-sm text-[#cc0000]">Couldn&apos;t load investor balances: {(owedQ.error as Error).message}</p>
        ) : withActivity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No investor sales yet. Nothing accrued.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  {["Investor", "Accrued", "Paid out", "Owed"].map((c) => (
                    <TableHead key={c} className={cn("text-white", c !== "Investor" && "text-right")}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {withActivity.map((o) => (
                  <TableRow key={o.investor_id}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(o.accrued_pkr)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(o.paid_out_pkr)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatPKR(o.owed_pkr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Payout history */}
        {(ledgerQ.data ?? []).length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  {["Date", "Investor", "Type", "Amount", "Note", ""].map((c) => (
                    <TableHead key={c} className={cn("text-white", c === "Amount" && "text-right", c === "" && "w-10")}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ledgerQ.data ?? []).map((p) => {
                  const isReversal = !!p.reverses_id;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(p.paid_on)}</TableCell>
                      <TableCell>{p.investors?.name ?? "—"}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", isReversal ? "border-border bg-muted text-muted-foreground" : "border-green-200 bg-green-50 text-green-700")}>
                          {isReversal ? "Reversal" : "Payout"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{isReversal ? "−" : "+"}{formatPKR(p.amount_pkr)}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{p.note}</TableCell>
                      <TableCell>
                        {can("delete") && !isReversal && (
                          <Button variant="ghost" size="icon" className="size-8" title="Reverse this payout" onClick={() => doReverse(p)}>
                            <Undo2 className="size-4 text-muted-foreground" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <PayoutDialog open={payoutOpen} onOpenChange={setPayoutOpen} investors={withActivity} />
    </section>
  );
}

function Stat({ label, value, help, highlight, tone }: { label: string; value: number; help: string; highlight?: boolean; tone?: "muted" }) {
  return (
    <div className={cn("rounded-md border p-3", highlight ? "border-[#cc0000]/30 bg-[#cc0000]/5" : "border-border bg-secondary/40")}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("[font-family:var(--font-heading)] text-lg font-bold tabular-nums", tone === "muted" && "text-muted-foreground")}>{formatPKR(value)}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{help}</p>
    </div>
  );
}

function PayoutDialog({ open, onOpenChange, investors }: { open: boolean; onOpenChange: (o: boolean) => void; investors: InvestorOwed[] }) {
  const record = useRecordPayout();
  const [investorId, setInvestorId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [note, setNote] = useState("");

  const picked = investors.find((i) => i.investor_id === investorId);

  async function submit() {
    if (!investorId) return toast.error("Choose an investor");
    try {
      await record.mutateAsync({ investor_id: investorId, amount_pkr: Number(amount), paid_on: paidOn || undefined, note: note.trim() || null });
      toast.success("Payout recorded");
      onOpenChange(false);
      setInvestorId(""); setAmount(""); setPaidOn(""); setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record payout"); // the DB guard rejects > owed
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record investor payout</DialogTitle>
          <DialogDescription>Draws down what's owed. You can&apos;t pay out more than the owed balance.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Investor</Label>
            <Select value={investorId} onValueChange={setInvestorId}>
              <SelectTrigger aria-label="Investor"><SelectValue placeholder="Choose an investor" /></SelectTrigger>
              <SelectContent>{investors.map((i) => <SelectItem key={i.investor_id} value={i.investor_id}>{i.name} · owed {formatPKR(i.owed_pkr)}</SelectItem>)}</SelectContent>
            </Select>
            {picked && <p className="text-xs text-muted-foreground">Owed: <span className="font-medium text-foreground">{formatPKR(picked.owed_pkr)}</span></p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Amount (PKR)</Label><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Note <span className="text-muted-foreground">(optional)</span></Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. bank transfer ref" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={record.isPending || !investorId || !amount}>
            {record.isPending ? "Saving…" : "Record payout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
