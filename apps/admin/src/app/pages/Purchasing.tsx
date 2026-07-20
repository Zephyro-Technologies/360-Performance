// Purchasing — the buy-side workspace. Overview (KPIs + the pipeline board) answers "where are
// my goods"; Purchase Orders is the dense table lens; Payments holds the vendor money position.
// A PO captures a purchase (vendor, frozen RMB rate, lines); receiving it (on the detail page)
// creates cost-bearing batches.
import { useEffect, useMemo, useState } from "react";
import { useOpenOnNewParam } from "../lib/useOpenOnNewParam";
import { useNavigate, useSearchParams } from "react-router";
import { Plus, ShoppingBag, ArrowRight, Wallet, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useOwedBySupplier,
  usePODues,
  PO_STATUS_LABEL,
  PO_STATUS_FLOW,
  type POStatus,
  type PODue,
} from "../data/purchasing";
import { paymentStatusOf, daysUntil } from "../data/poState";
import { StatusBadge, PaymentBadge } from "../components/purchasing/StatusBadges";
import { PurchaseBoard } from "../components/purchasing/PurchaseBoard";
import { useVendorBalances, useRecordAdvance, useLogisticsVendors, vendorTag, VENDOR_ROLE_LABEL, type VendorRole } from "../data/vendorAdvances";
import { useSuppliers } from "../data/catalog";
import { useAuth } from "../data/auth";
import { PageHeader } from "../components/common/PageHeader";
import { useTableSort, SortHead } from "../components/common/useTableSort";
import { formatPKR, formatCompact, formatDate } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@360/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";

// Select needs a non-empty sentinel value for the "no freight vendor" option.
const NO_FREIGHT = "none";

interface SupBal { supplier_id: string | null; vendor_account_id: string; name: string; role: VendorRole | null; owed: number; credit: number; net: number }
const VENDOR_PREVIEW = 4; // rows shown before "Show all"

export function Purchasing() {
  const posQ = usePurchaseOrders();
  const vendorBalancesQ = useVendorBalances();
  const owedQ = useOwedBySupplier();
  const duesQ = usePODues();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  // Controlled so "Plan a purchase" can jump back to Overview: the plan dialog lives inside
  // PurchaseBoard, which Radix unmounts while another tab is active — from Payments the click
  // would otherwise do nothing at all.
  const [tab, setTab] = useState("overview");
  const [params, setParams] = useSearchParams();
  function openPlanADraft() {
    setTab("overview");
    const next = new URLSearchParams(params);
    next.set("plan", "1");   // PurchaseBoard picks this up, opens a blank plan, then strips it
    setParams(next, { replace: true });
  }
  const [payFor, setPayFor] = useState<SupBal | null>(null);
  const [vpOpen, setVpOpen] = useState(true); // collapse the vendor-payments summary
  const [showAllVendors, setShowAllVendors] = useState(false); // brief vs full vendor list
  const [poQuery, setPoQuery] = useState("");
  const [poStatus, setPoStatus] = useState<POStatus | "all">("all");
  useOpenOnNewParam(() => setDialogOpen(true)); // topbar "+ New → Purchase order"

  const pos = posQ.data ?? [];
  // Per-PO money position (cost/paid/due), for the table's Payment column + the overview KPIs.
  const dueByPo = useMemo(() => {
    const m = new Map<string, PODue>();
    for (const d of duesQ.data ?? []) m.set(d.purchase_order_id, d);
    return m;
  }, [duesQ.data]);

  const poTerm = poQuery.trim().toLowerCase();
  const filteredPos = pos.filter(
    (p) =>
      (poStatus === "all" || p.status === poStatus) &&
      (!poTerm || (p.po_no ?? "").toLowerCase().includes(poTerm) || (p.suppliers?.name ?? "").toLowerCase().includes(poTerm)),
  );
  const poSort = useTableSort(
    filteredPos,
    {
      po: (p) => p.po_no,
      vendor: (p) => p.suppliers?.name ?? null,
      status: (p) => p.status,
      payment: (p) => { const d = dueByPo.get(p.id); return d ? d.due : null; },
      lines: (p) => p.line_count,
      rate: (p) => p.frozen_rate_rmb_pkr,
      ordered: (p) => p.ordered_on,
    },
    "ordered",
    "desc",
  );

  // Overview KPIs. In-flight = money committed on open (not received/cancelled) POs; arriving =
  // in-transit POs landing within 30 days.
  let inFlight = 0;
  let arriving30 = 0;
  for (const po of pos) {
    if (po.status === "received" || po.status === "cancelled") continue;
    const d = dueByPo.get(po.id);
    if (d) inFlight += d.cost;
    if (po.status === "in_transit") {
      const days = daysUntil(po.expected_on);
      if (days != null && days >= 0 && days <= 30) arriving30 += 1;
    }
  }

  const owed = owedQ.data ?? {};
  // Every vendor (product + air/sea freight), each with a type. Product vendors can owe on POs
  // (vendor_payables); freight vendors only hold prepaid credit (owed = 0). Add credit here.
  const suppliers: SupBal[] = (vendorBalancesQ.data ?? []).map((v) => {
    const owedAmt = v.supplier_id ? (owed[v.supplier_id] ?? 0) : 0;
    const credit = Math.max(0, v.balance_pkr);
    return { supplier_id: v.supplier_id, vendor_account_id: v.vendor_account_id, name: v.name, role: v.role, owed: owedAmt, credit, net: credit - owedAmt };
  });
  const shownVendors = showAllVendors ? suppliers : suppliers.slice(0, VENDOR_PREVIEW);
  const totalPayable = suppliers.reduce((s, b) => s + Math.max(0, -b.net), 0);
  const totalCredit = suppliers.reduce((s, b) => s + Math.max(0, b.net), 0);
  // Order-level payment status: what each PO cost, what's paid, what's due, and Done/Partial/Pending.
  const nameBySupplier = new Map(suppliers.filter((s) => s.supplier_id).map((s) => [s.supplier_id as string, s.name]));
  const orderRows = (duesQ.data ?? []).map((d) => ({
    ...d,
    vendor: nameBySupplier.get(d.supplier_id) ?? null,
  }));
  const dueSort = useTableSort(
    orderRows,
    {
      po: (o) => o.po_no,
      vendor: (o) => o.vendor,
      cost: (o) => o.cost,
      paid: (o) => o.paid,
      due: (o) => o.due,
      credit: (o) => o.credit,
      status: (o) => paymentStatusOf(o),
    },
    "due",
    "desc",
  );

  const kpis = [
    { label: "In flight", value: formatCompact(inFlight), tone: "" },
    { label: "Arriving ≤ 30d", value: String(arriving30), tone: "" },
    { label: "Owed to vendors", value: formatCompact(totalPayable), tone: totalPayable > 0 ? "text-amber-700" : "" },
    { label: "Vendor credit", value: formatCompact(totalCredit), tone: totalCredit > 0 ? "text-green-700" : "" },
  ];

  return (
    <div>
      <PageHeader
        title="Purchasing"
        subtitle="Source stock, receive shipments, and track what you owe each vendor"
        actions={
          can("edit") ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={openPlanADraft}>
                <Plus className="size-4" /> Plan a purchase
              </Button>
              <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" /> New purchase order
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 h-12 w-full">
          <TabsTrigger value="overview" className="text-base font-medium">Overview</TabsTrigger>
          <TabsTrigger value="orders" className="text-base font-medium">Purchase Orders</TabsTrigger>
          <TabsTrigger value="payments" className="text-base font-medium">Payments</TabsTrigger>
        </TabsList>

        {/* OVERVIEW — glance: KPIs + the pipeline board */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-md border border-border bg-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className={cn("[font-family:var(--font-heading)] text-xl font-bold tabular-nums", k.tone)}>{k.value}</p>
              </div>
            ))}
          </div>
          <PurchaseBoard />
        </TabsContent>

        {/* PURCHASE ORDERS — the dense table lens */}
        <TabsContent value="orders" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 [font-family:var(--font-heading)] text-lg uppercase tracking-wide">
              <ShoppingBag className="size-5 text-[#cc0000]" /> Purchase orders
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">{pos.length}</span>
            </h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by PO # or vendor…" value={poQuery} onChange={(e) => setPoQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={poStatus} onValueChange={(v) => setPoStatus(v as POStatus | "all")}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PO_STATUS_FLOW.map((s) => <SelectItem key={s} value={s}>{PO_STATUS_LABEL[s]}</SelectItem>)}
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  <SortHead label="PO #" sortKey="po" sort={poSort} className="text-white" />
                  <SortHead label="Vendor" sortKey="vendor" sort={poSort} className="text-white" />
                  <SortHead label="Stage" sortKey="status" sort={poSort} className="text-white" />
                  <SortHead label="Payment" sortKey="payment" sort={poSort} className="text-white" />
                  <SortHead label="Lines" sortKey="lines" sort={poSort} className="text-white text-right" align="right" />
                  <SortHead label="RMB rate" sortKey="rate" sort={poSort} className="text-white text-right" align="right" />
                  <SortHead label="Ordered" sortKey="ordered" sort={poSort} className="text-white" />
                  <TableHead className="w-10 text-white" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {poSort.sorted.map((po) => {
                  const d = dueByPo.get(po.id);
                  return (
                    <TableRow key={po.id} className="cursor-pointer" onClick={() => navigate(`/purchasing/${po.id}`)}>
                      <TableCell className="font-mono font-medium">{po.po_no}</TableCell>
                      <TableCell>{po.suppliers?.name ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={po.status} /></TableCell>
                      <TableCell>{d ? <PaymentBadge status={paymentStatusOf(d)} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{po.line_count}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{po.frozen_rate_rmb_pkr != null ? po.frozen_rate_rmb_pkr : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{po.ordered_on ? formatDate(po.ordered_on) : "—"}</TableCell>
                      <TableCell><ArrowRight className="size-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {posQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
            {posQ.isError && <p className="p-6 text-center text-[#cc0000]">{(posQ.error as Error).message}</p>}
            {!posQ.isLoading && !posQ.isError && filteredPos.length === 0 && (
              <p className="p-6 text-center text-muted-foreground">
                {pos.length === 0 ? "No purchase orders yet. Create one to start sourcing stock." : "No purchase orders match your filters."}
              </p>
            )}
          </div>
        </TabsContent>

        {/* PAYMENTS — the vendor money position (unchanged: money lives here + in Finance) */}
        <TabsContent value="payments" className="space-y-3">
          <section className="overflow-hidden rounded-md border border-border bg-card">
            <button type="button" onClick={() => setVpOpen((o) => !o)} className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 text-left hover:bg-secondary/40">
              <div className="flex items-center gap-2">
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !vpOpen && "-rotate-90")} />
                <Wallet className="size-4 text-[#cc0000]" />
                <span className="font-heading uppercase tracking-wide">Vendor payments</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 tabular-nums">Due {formatPKR(totalPayable)}</span>
                <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 tabular-nums">Credit {formatPKR(totalCredit)}</span>
              </div>
            </button>
            {vpOpen && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border bg-secondary/50 hover:bg-secondary/50">
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Type</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">Owed on orders</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">Credit held</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">Net balance</TableHead>
                    {can("edit") && <TableHead className="w-28" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownVendors.map((b) => (
                    <TableRow key={b.vendor_account_id} className="hover:bg-secondary/40">
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-muted-foreground">{vendorTag(b)}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.owed > 0 ? formatPKR(b.owed) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.credit > 0 ? formatPKR(b.credit) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.net > 0 ? <span className="font-medium text-green-700">{formatPKR(b.net)} credit</span>
                          : b.net < 0 ? <span className="font-medium text-amber-700">{formatPKR(-b.net)} due</span>
                          : <span className="text-muted-foreground">settled</span>}
                      </TableCell>
                      {can("edit") && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" className="text-green-700" onClick={() => setPayFor(b)}>Add credit</Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {suppliers.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={can("edit") ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">
                        No vendors yet. Add one in Data Management.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {suppliers.length > VENDOR_PREVIEW && (
                <button type="button" onClick={() => setShowAllVendors((s) => !s)} className="w-full border-t border-border py-2 text-center text-xs font-medium text-[#cc0000] hover:bg-secondary/40">
                  {showAllVendors ? "Show less" : `Show all ${suppliers.length} vendors`}
                </button>
              )}
            </div>
            )}
          </section>
          <p className="text-xs text-muted-foreground">
            Settle an order&apos;s dues on the order itself (open a PO under <span className="font-medium">Purchase Orders</span>), where you can also pay from a vendor&apos;s credit. Use <span className="font-medium">Add credit</span> to prepay a vendor for future orders. The full ledger lives in <span className="font-medium">Finance → Vendor Advances</span>.
          </p>

          <section className="space-y-3">
            <h2 className="[font-family:var(--font-heading)] text-lg uppercase tracking-wide">Order payments &amp; dues</h2>
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-black hover:bg-black">
                    <SortHead label="PO #" sortKey="po" sort={dueSort} className="text-white" />
                    <SortHead label="Vendor" sortKey="vendor" sort={dueSort} className="text-white" />
                    <SortHead label="Order cost" sortKey="cost" sort={dueSort} className="text-right text-white" align="right" />
                    <SortHead label="Paid" sortKey="paid" sort={dueSort} className="text-right text-white" align="right" />
                    <SortHead label="Due" sortKey="due" sort={dueSort} className="text-right text-white" align="right" />
                    <SortHead label="Credit added" sortKey="credit" sort={dueSort} className="text-right text-white" align="right" />
                    <SortHead label="Status" sortKey="status" sort={dueSort} className="text-white" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dueSort.sorted.map((o) => (
                    <TableRow key={o.purchase_order_id} className="cursor-pointer" onClick={() => navigate(`/purchasing/${o.purchase_order_id}`)}>
                      <TableCell className="font-mono font-medium">{o.po_no ?? "—"}</TableCell>
                      <TableCell>{o.vendor ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(o.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatPKR(o.paid)}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.due > 0 ? <span className="font-medium text-amber-700">{formatPKR(o.due)}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.credit > 0 ? <span className="font-medium text-green-700">+{formatPKR(o.credit)}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell><PaymentBadge status={paymentStatusOf(o)} /></TableCell>
                    </TableRow>
                  ))}
                  {orderRows.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        No orders to pay yet. Orders appear here once ordered &amp; received.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {duesQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <NewPODialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <AddCreditDialog supplier={payFor} onOpenChange={(o) => !o && setPayFor(null)} />
    </div>
  );
}

function NewPODialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const suppliersQ = useSuppliers();
  const freightQ = useLogisticsVendors();
  const create = useCreatePurchaseOrder();
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState("");
  const [freightId, setFreightId] = useState(NO_FREIGHT);
  const [status, setStatus] = useState<POStatus>("planning");
  const [rate, setRate] = useState("");
  const [orderedOn, setOrderedOn] = useState("");

  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);
  const freightVendors = useMemo(() => (freightQ.data ?? []).filter((v) => v.active), [freightQ.data]);

  async function submit() {
    if (!supplierId) {
      toast.error("Choose a vendor");
      return;
    }
    try {
      const id = await create.mutateAsync({
        supplier_id: supplierId,
        status,
        frozen_rate_rmb_pkr: rate.trim() ? Number(rate) : null,
        ordered_on: orderedOn || null,
        freight_vendor_id: freightId === NO_FREIGHT ? null : freightId,
      });
      toast.success("Purchase order created");
      onOpenChange(false);
      setSupplierId("");
      setFreightId(NO_FREIGHT);
      setRate("");
      setOrderedOn("");
      setStatus("planning");
      navigate(`/purchasing/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
          <DialogDescription>Pick a product-source vendor. Add lines and receive on the next screen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Vendor</Label>
            {suppliers.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                No active vendors. Add one in Data Management → Suppliers first.
              </p>
            ) : (
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Choose a vendor" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Freight vendor <span className="text-muted-foreground">(sea / air; optional, the PO default)</span></Label>
            <Select value={freightId} onValueChange={setFreightId}>
              <SelectTrigger><SelectValue placeholder="No freight vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FREIGHT}>No freight vendor</SelectItem>
                {freightVendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {VENDOR_ROLE_LABEL[v.role]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as POStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["planning", "approved", "ordered", "in_production", "in_transit"] as POStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{PO_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>RMB → PKR rate <span className="text-muted-foreground">(optional)</span></Label>
              <Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 40" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Ordered on <span className="text-muted-foreground">(optional)</span></Label>
            <Input type="date" value={orderedOn} onChange={(e) => setOrderedOn(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={create.isPending || !supplierId}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add advance credit for a vendor — money you prepay that they hold for future orders. Posts a
// top-up to the vendor account (visible in Vendor Advances); it's later drawn down when you pay an
// order from credit. Order dues themselves are settled on the order, not here.
function AddCreditDialog({ supplier, onOpenChange }: { supplier: SupBal | null; onOpenChange: (o: boolean) => void }) {
  const record = useRecordAdvance();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (supplier) {
      setAmount("");
      setPaidOn("");
      setNote("");
    }
  }, [supplier]);

  const amt = Number(amount) || 0;

  async function submit() {
    if (!supplier) return;
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be more than 0.");
    try {
      await record.mutateAsync({
        vendor_account_id: supplier.vendor_account_id,
        kind: "topup",
        amount_pkr: amt,
        occurred_on: paidOn || undefined,
        note: note.trim() || "Advance credit",
      });
      toast.success("Credit added");
      onOpenChange(false);
    } catch (e) {
      // ZodError.message is the raw issue JSON — show the first issue's text instead.
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not add credit");
    }
  }

  return (
    <Dialog open={!!supplier} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add credit: {supplier?.name}</DialogTitle>
          <DialogDescription>
            {supplier && supplier.credit > 0 ? `${formatPKR(supplier.credit)} credit currently held. ` : ""}Prepay this vendor; the credit is used when you settle a future order from it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Amount (PKR)</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional (e.g. wire reference)" /></div>
          {amt > 0 && (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              Adds {formatPKR(amt)} credit with {supplier?.name} for future orders. Visible in Vendor Advances.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={record.isPending || !amt}>Add credit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
