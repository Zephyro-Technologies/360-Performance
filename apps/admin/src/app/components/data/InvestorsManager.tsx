// Investors management — create investors + deals (per-deal profit split). Products are
// assigned to a deal in the product editor; the owed balance + payouts live in the settlement
// panel below on the same Investors page. This block is the entity master.
import { useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useInvestors,
  useInvestorDeals,
  useCreateInvestor,
  useCreateInvestorDeal,
  type Investor,
} from "../../data/investors";
import { useAuth } from "../../data/auth";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { PhoneInput } from "../shared/PhoneInput";
import { Textarea } from "@360/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";

export function InvestorsManager() {
  const investorsQ = useInvestors();
  const dealsQ = useInvestorDeals();
  const { can } = useAuth();
  const [newInvestor, setNewInvestor] = useState(false);
  const [newDeal, setNewDeal] = useState(false);

  const investors = investorsQ.data ?? [];
  const deals = dealsQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="size-4 text-muted-foreground" />
            <h2 className="[font-family:var(--font-heading)] uppercase tracking-wide">Investors &amp; deals</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Who funds your inventory and their profit-split deals. Assign a product to a deal in the product editor.</p>
        </div>
        {can("edit") && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setNewDeal(true)} disabled={investors.length === 0}>
              <Plus className="size-4" /> New deal
            </Button>
            <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => setNewInvestor(true)}>
              <Plus className="size-4" /> New investor
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              {["Investor", "Contact", "Deals (profit split)"].map((c) => <TableHead key={c} className="text-white">{c}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {investors.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.name}{!inv.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}</TableCell>
                <TableCell className="text-muted-foreground">
                  <p>{inv.phone}</p>
                  {/* Legacy free-text contact (the dialog now collects the phone only). */}
                  {inv.contact && <p className="text-xs">{inv.contact}</p>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {deals.filter((d) => d.investor_id === inv.id).map((d) => (
                      <span key={d.id} className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 tabular-nums">
                        {Math.round(d.split_pct * 100)}%{d.label ? ` · ${d.label}` : ""}
                      </span>
                    ))}
                    {deals.filter((d) => d.investor_id === inv.id).length === 0 && <span className="text-xs text-muted-foreground">no deals yet</span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {investors.length === 0 && <p className="p-6 text-center text-muted-foreground">No investors yet. Add one, then create a deal to assign products to.</p>}
      </div>

      <NewInvestorDialog open={newInvestor} onOpenChange={setNewInvestor} />
      <NewDealDialog open={newDeal} onOpenChange={setNewDeal} investors={investors} />
    </div>
  );
}

function NewInvestorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateInvestor();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    if (!name.trim()) return toast.error("Enter a name");
    try {
      // `contact` is retired from the form — the phone is the single contact field now.
      await create.mutateAsync({ name, contact: null, phone: phone.trim() || null, notes: notes.trim() || null });
      toast.success("Investor added");
      onOpenChange(false);
      setName(""); setPhone(""); setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add investor");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New investor</DialogTitle>
          <DialogDescription>The person/entity who funds specific inventory. Create a deal next to set their split.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Phone</Label><PhoneInput value={phone} onChange={setPhone} /></div>
          <div className="space-y-2"><Label>Notes <span className="text-muted-foreground">(optional)</span></Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Saving…" : "Add investor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewDealDialog({ open, onOpenChange, investors }: { open: boolean; onOpenChange: (o: boolean) => void; investors: Investor[] }) {
  const create = useCreateInvestorDeal();
  const [investorId, setInvestorId] = useState("");
  const [split, setSplit] = useState("50");
  const [label, setLabel] = useState("");

  async function submit() {
    if (!investorId) return toast.error("Choose an investor");
    const pct = Number(split);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return toast.error("Split must be 0–100%");
    try {
      await create.mutateAsync({ investor_id: investorId, split_pct: pct / 100, label: label.trim() || null });
      toast.success("Deal created");
      onOpenChange(false);
      setInvestorId(""); setSplit("50"); setLabel("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create deal");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New deal</DialogTitle>
          <DialogDescription>A profit split for an investor. The investor keeps their capital back + this % of the profit on sold units.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Investor</Label>
            <Select value={investorId} onValueChange={setInvestorId}>
              <SelectTrigger aria-label="Investor"><SelectValue placeholder="Choose an investor" /></SelectTrigger>
              <SelectContent>{investors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Investor split %</Label><Input type="number" min={0} max={100} value={split} onChange={(e) => setSplit(e.target.value)} /></div>
            <div className="space-y-2"><Label>Label <span className="text-muted-foreground">(optional)</span></Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Batch 1" /></div>
          </div>
          <p className={cn("text-xs text-muted-foreground")}>House keeps {100 - (Number(split) || 0)}% of the profit; the investor gets {Number(split) || 0}% + their capital back.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={create.isPending || !investorId}>
            {create.isPending ? "Saving…" : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
