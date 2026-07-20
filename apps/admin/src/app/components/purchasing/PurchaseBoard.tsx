// The pipeline board — the Overview centerpiece answering "where are my goods". Six lanes read
// left to right: Planning → Approved → Ordered → In production → In transit → Arrived. They are
// exactly the po_status values offered by the PO detail dropdown, in the same order, so the two
// surfaces can never disagree. There is no separate wishlist lane: planned_purchases (things
// wanted before a vendor is picked, which cannot be POs since supplier_id is NOT NULL) render as
// cards at the top of Planning. Cards are DRAGGABLE across the middle lanes (react-dnd, same pattern
// as the Order Pipeline): dropping a PO advances its stage; dropping an eligible planned item onto
// Ordered turns it into a PO. "Arrived" is DERIVED — a PO only lands there by receiving its lines
// through the receive_po_line RPC (which mints the cost-bearing batch), so it is not a drop target
// and cannot be reached by a status flip. Filters (search / vendor / category / payment) persist in
// the URL. Each card fuses goods-position (lane) + money-position (chip) + a stage-appropriate date.
import { useCallback, useEffect, useMemo, useState, type Ref } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { ArrowUpRight, ChevronRight, PackageCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { usePurchaseOrders, usePODues, useUpdatePurchaseOrder, type PurchaseOrderListRow, type PODue, type POStatus } from "../../data/purchasing";
import { usePlannedPurchases, useGraduatePlanned, PRIORITY_LABEL, type PlannedPurchase, type PlanPriority } from "../../data/pipeline";
import { useCategories, groupCategories, useProducts } from "../../data/catalog";
import { useAuth } from "../../data/auth";
import { BOARD_LANES, boardLaneOf, paymentStatusOf, etaLabel, PAYMENT_LABEL, PAYMENT_TONE, type BoardLane, type PaymentStatus } from "../../data/poState";
import { PlannedDialog, type PlannedPrefill } from "./PlannedDialog";
import { PurchaseOrderDrawer } from "../../pages/PurchaseOrderDetail";
import { formatPKR, formatCompact, formatDate, timeAgo } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Skeleton } from "@360/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";

const PRIORITY_TONE: Record<PlanPriority, string> = {
  high: "border-[#cc0000]/30 bg-[#cc0000]/10 text-[#cc0000]",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-border bg-muted text-muted-foreground",
};

const DND_PO = "PO_CARD";
const DND_PLAN = "PLAN_CARD";

// Lanes that accept a dropped PO, and the status the drop sets. Draft/Arrived/Planned are NOT
// drop targets: Draft is an entry state (new POs start there), and Arrived is derived from
// receiving. So a drop can only ever move a PO forward-or-back among ordered/production/transit —
// never into "received".
type DropLane = "approved" | "ordered" | "production" | "transit";
const LANE_STATUS: Record<DropLane, POStatus> = {
  approved: "approved", ordered: "ordered", production: "in_production", transit: "in_transit",
};
const DROP_ACCEPT: Record<BoardLane, string[]> = {
  planning: [],            // a PO enters at Planning; nothing is dropped back into it
  approved: [DND_PO],
  ordered: [DND_PO, DND_PLAN],
  production: [DND_PO],
  transit: [DND_PO],
  arrived: [],             // never a drop target — arrival goes through the receive flow
};
const LANE_LABEL: Record<BoardLane, string> = Object.fromEntries(BOARD_LANES.map((l) => [l.key, l.label])) as Record<BoardLane, string>;

// The per-card forward action (keyboard/touch path — drag is pointer-only). "advance" bumps the
// stage; "receive" routes to the PO's receive flow (arrival is never a plain status flip).
type NextAction = { kind: "advance"; lane: DropLane; label: string } | { kind: "receive" } | null;
const LANE_NEXT: Record<BoardLane, NextAction> = {
  planning: { kind: "advance", lane: "approved", label: "Approve" },
  approved: { kind: "advance", lane: "ordered", label: "Order" },
  ordered: { kind: "advance", lane: "production", label: "In production" },
  production: { kind: "advance", lane: "transit", label: "In transit" },
  transit: { kind: "receive" },
  arrived: null,
};

type PayFilter = "all" | PaymentStatus;

// Card order WITHIN each lane. A view preference, not a filter — it hides nothing, so it is
// left out of `filtersOn` and survives the Clear button.
type SortKey = "recent" | "oldest" | "eta" | "value" | "vendor";
export const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "eta", label: "Arriving soonest" },
  { key: "value", label: "Highest value" },
  { key: "vendor", label: "Vendor A–Z" },
];

// Undated POs sort last under "Arriving soonest" rather than jumping to the front — a missing
// ETA is unknown, not imminent.
const LAST = Number.POSITIVE_INFINITY;
// Comparators must tolerate a missing field: one card without a timestamp should not take the
// whole board down with it. Empty sorts last under A–Z and oldest-first, first under newest.
const cmp = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").localeCompare(b ?? "");
export function poSorter(sort: SortKey, dues: Map<string, PODue>) {
  return (a: PurchaseOrderListRow, b: PurchaseOrderListRow) => {
    switch (sort) {
      case "oldest": return cmp(a.created_at, b.created_at);
      case "eta": {
        const ax = a.expected_on ? Date.parse(a.expected_on) : LAST;
        const bx = b.expected_on ? Date.parse(b.expected_on) : LAST;
        return ax - bx;
      }
      case "value": return (dues.get(b.id)?.cost ?? 0) - (dues.get(a.id)?.cost ?? 0);
      case "vendor": return cmp(a.suppliers?.name, b.suppliers?.name);
      default: return cmp(b.created_at, a.created_at);   // recent
    }
  };
}

// Wishlist cards have no ETA and no real cost — under those sorts they keep their worklist
// order (priority first), which is the only meaningful ordering they have.
export function planSorter(sort: SortKey) {
  return (a: PlannedPurchase, b: PlannedPurchase) => {
    switch (sort) {
      case "oldest": return cmp(a.created_at, b.created_at);
      case "value":
        return ((b.planned_qty ?? 0) * (b.est_unit_cost_pkr ?? 0)) - ((a.planned_qty ?? 0) * (a.est_unit_cost_pkr ?? 0));
      case "vendor": return cmp(a.suppliers?.name, b.suppliers?.name);
      case "eta": return 0;
      default: return cmp(b.created_at, a.created_at);   // recent
    }
  };
}

export function PurchaseBoard() {
  const posQ = usePurchaseOrders();
  const duesQ = usePODues();
  const plansQ = usePlannedPurchases();
  const categoriesQ = useCategories();
  const updatePO = useUpdatePurchaseOrder();
  const graduate = useGraduatePlanned();
  const productsQ = useProducts();
  const { can } = useAuth();
  const [planEditing, setPlanEditing] = useState<PlannedPurchase | null>(null);
  const [planPrefill, setPlanPrefill] = useState<PlannedPrefill | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [announce, setAnnounce] = useState(""); // sr-only live-region text for stage moves
  const [activePO, setActivePO] = useState<string | null>(null); // PO open in the side drawer

  // Filters live in the URL so they survive tab switches and reloads (Radix Tabs unmounts the
  // Overview panel, which would otherwise reset local state on every visit).
  const [params, setParams] = useSearchParams();
  const q = params.get("pq") ?? "";
  const vendor = params.get("pv") ?? "all";
  const cat = params.get("pc") ?? "all";
  const pay = (params.get("pp") ?? "all") as PayFilter;
  const sort = (params.get("psort") ?? "recent") as SortKey;
  const setParam = (key: string, val: string, dflt: string) => {
    const next = new URLSearchParams(params);
    if (val && val !== dflt) next.set(key, val);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // "Plan a purchase" now lives in the page header (next to New purchase order), which sits
  // outside this component AND outside the tab that mounts it — so it signals through the URL
  // rather than a prop, the same way ?restock= below does. Stripped after opening so a refresh
  // or back doesn't reopen it.
  useEffect(() => {
    if (params.get("plan") !== "1") return;
    openNewPlan();
    const next = new URLSearchParams(params);
    next.delete("plan");
    setParams(next, { replace: true });
  }, [params, setParams]);

  // Restock jump: an out-of-stock order line links here with ?restock=<productId>&qty=<shortfall>.
  // Resolve the product (wait for the catalogue so we can seed its name), open a pre-filled new
  // plan, then strip the params so a refresh/back doesn't reopen it.
  useEffect(() => {
    const restock = params.get("restock");
    if (!restock || !productsQ.data) return;
    const product = productsQ.data.find((p) => p.id === restock);
    const qtyNum = Number(params.get("qty"));
    setPlanEditing(null);
    setPlanPrefill({ item_name: product?.name ?? "", product_id: restock, planned_qty: Number.isFinite(qtyNum) && qtyNum > 0 ? Math.floor(qtyNum) : null });
    setPlanOpen(true);
    const next = new URLSearchParams(params);
    next.delete("restock");
    next.delete("qty");
    setParams(next, { replace: true });
  }, [params, productsQ.data, setParams]);

  const dues = useMemo(() => {
    const m = new Map<string, PODue>();
    for (const d of duesQ.data ?? []) m.set(d.purchase_order_id, d);
    return m;
  }, [duesQ.data]);

  // Vendor options — every name that appears on a PO or a planned item.
  const vendorNames = useMemo(() => {
    const s = new Set<string>();
    for (const po of posQ.data ?? []) if (po.suppliers?.name) s.add(po.suppliers.name);
    for (const p of plansQ.data ?? []) if (p.suppliers?.name) s.add(p.suppliers.name);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [posQ.data, plansQ.data]);

  // Category options grouped parent → leaves.
  const catGroups = useMemo(() => groupCategories(categoriesQ.data ?? []), [categoriesQ.data]);
  // Leaf-category ids the current filter matches: a parent = itself + all its leaves, a leaf =
  // just itself. null when "all". Including the parent id covers a product attached to a parent.
  const catSet = useMemo(() => {
    if (cat === "all") return null;
    const children = (categoriesQ.data ?? []).filter((c) => c.parent_id === cat).map((c) => c.id);
    return new Set([cat, ...children]);
  }, [cat, categoriesQ.data]);

  const term = q.trim().toLowerCase();
  const poMatches = useCallback(
    (po: PurchaseOrderListRow) => {
      if (vendor !== "all" && po.suppliers?.name !== vendor) return false;
      if (catSet && !po.category_ids.some((id) => catSet.has(id))) return false;
      if (pay !== "all") {
        const d = dues.get(po.id);
        if (!d || paymentStatusOf(d) !== pay) return false;
      }
      if (term && !(po.po_no ?? "").toLowerCase().includes(term) && !(po.suppliers?.name ?? "").toLowerCase().includes(term)) return false;
      return true;
    },
    [vendor, catSet, pay, dues, term],
  );
  const planMatches = useCallback(
    (p: PlannedPurchase) => {
      if (pay !== "all") return false; // planned items have no payment state — a payment filter hides them
      if (vendor !== "all" && p.suppliers?.name !== vendor) return false;
      if (catSet && !(p.products?.category_id && catSet.has(p.products.category_id))) return false;
      if (term && !p.item_name.toLowerCase().includes(term) && !(p.suppliers?.name ?? "").toLowerCase().includes(term)) return false;
      return true;
    },
    [pay, vendor, catSet, term],
  );

  // POs grouped into their five real lanes (cancelled excluded), after filtering.
  const poByLane = useMemo(() => {
    const g: Record<BoardLane, PurchaseOrderListRow[]> = { planning: [], approved: [], ordered: [], production: [], transit: [], arrived: [] };
    for (const po of posQ.data ?? []) {
      const lane = boardLaneOf(po.status);
      if (lane && poMatches(po)) g[lane].push(po);
    }
    for (const lane of Object.keys(g) as BoardLane[]) g[lane].sort(poSorter(sort, dues));
    return g;
  }, [posQ.data, poMatches, sort, dues]);

  // The live wishlist (already graduated / dropped items drop out), filtered — shown in Planning.
  const planned = useMemo(
    () => (plansQ.data ?? [])
      .filter((p) => p.status !== "ordered" && p.status !== "dropped" && planMatches(p))
      .sort(planSorter(sort)),
    [plansQ.data, planMatches, sort],
  );

  function openNewPlan() { setPlanEditing(null); setPlanPrefill(null); setPlanOpen(true); }
  function openEditPlan(p: PlannedPurchase) { setPlanEditing(p); setPlanPrefill(null); setPlanOpen(true); }

  // Drop a PO into a lane → advance its stage. No-op if it's already in that lane; refuses to move
  // a received PO (its stock/batches are already posted — correct that on the PO page, not here).
  const dropPO = useCallback(
    async (id: string, lane: DropLane) => {
      const po = (posQ.data ?? []).find((p) => p.id === id);
      if (!po) return;
      if (po.status === "received") {
        toast.info("This PO is already received. Change its stage on the PO page if you need to.");
        return;
      }
      if (boardLaneOf(po.status) === lane) return; // same lane
      try {
        await updatePO.mutateAsync({ id, status: LANE_STATUS[lane] });
        toast.success(`${po.po_no ?? "PO"} moved to ${LANE_LABEL[lane]}`);
        setAnnounce(`${po.po_no ?? "PO"} moved to ${LANE_LABEL[lane]}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not move");
      }
    },
    [posQ.data, updatePO],
  );

  // Drop a planned item onto Ordered → graduate it into a PO. Stays on the board (the lists
  // refresh, so the card leaves Planned and the new PO appears in Ordered). Ineligible items are
  // rejected with a clear reason.
  const dropPlan = useCallback(
    async (id: string) => {
      const p = (plansQ.data ?? []).find((x) => x.id === id);
      if (!p) return;
      if (!p.product_id || !p.supplier_id) {
        toast.error(`Link a product and a vendor to "${p.item_name}" before turning it into a PO`);
        return;
      }
      try {
        await graduate.mutateAsync(id);
        toast.success(`"${p.item_name}" is now a purchase order`);
        setAnnounce(`${p.item_name} turned into a purchase order`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create the PO");
      }
    },
    [plansQ.data, graduate],
  );

  // Planning holds both real planning-stage POs and the vendor-less wishlist items.
  const laneCount = (key: BoardLane) => poByLane[key].length + (key === "planning" ? planned.length : 0);
  const loading = posQ.isLoading || duesQ.isLoading || plansQ.isLoading;
  const errored = posQ.isError || duesQ.isError || plansQ.isError;
  const filtersOn = term !== "" || vendor !== "all" || pay !== "all" || cat !== "all";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="[font-family:var(--font-heading)] text-lg uppercase tracking-wide">Pipeline</h2>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search PO #, vendor, or planned item…" value={q} onChange={(e) => setParam("pq", e.target.value, "")} className="pl-9" />
        </div>
        <Select value={vendor} onValueChange={(v) => setParam("pv", v, "all")}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by vendor"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {vendorNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cat} onValueChange={(v) => setParam("pc", v, "all")}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {catGroups.map((g) =>
              g.parent ? (
                [
                  <SelectItem key={g.parent.id} value={g.parent.id} className="font-medium">{g.parent.name}</SelectItem>,
                  ...g.leaves.map((leaf) => <SelectItem key={leaf.id} value={leaf.id} className="pl-8 text-muted-foreground">{leaf.name}</SelectItem>),
                ]
              ) : (
                g.leaves.map((leaf) => <SelectItem key={leaf.id} value={leaf.id}>{leaf.name}</SelectItem>)
              ),
            )}
          </SelectContent>
        </Select>
        <Select value={pay} onValueChange={(v) => setParam("pp", v, "all")}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by payment"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any payment</SelectItem>
            <SelectItem value="unpaid">{PAYMENT_LABEL.unpaid}</SelectItem>
            <SelectItem value="partial">{PAYMENT_LABEL.partial}</SelectItem>
            <SelectItem value="paid">{PAYMENT_LABEL.paid}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setParam("psort", v, "recent")}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort cards"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORTS.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtersOn && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => { const n = new URLSearchParams(params); ["pq", "pv", "pc", "pp"].forEach((k) => n.delete(k)); setParams(n, { replace: true }); }}
          >
            Clear
          </Button>
        )}
      </div>

      {errored ? (
        <p className="rounded-md border border-[#cc0000]/30 bg-[#cc0000]/5 p-6 text-center text-sm text-[#cc0000]">
          Couldn&apos;t load the board. {(posQ.error ?? duesQ.error ?? plansQ.error) instanceof Error ? (posQ.error ?? duesQ.error ?? plansQ.error)?.message : "Please retry."}
        </p>
      ) : (
        <DndProvider backend={HTML5Backend}>
          <div className="grid grid-flow-col auto-cols-[minmax(216px,1fr)] gap-3 overflow-x-auto pb-2">
            {BOARD_LANES.map((lane) => (
              <Lane
                key={lane.key}
                lane={lane.key}
                label={lane.label}
                count={laneCount(lane.key)}
                canEdit={can("edit")}
                onDropPO={dropPO}
                onDropPlan={dropPlan}
                loading={loading}
                empty={!loading && laneCount(lane.key) === 0}
                emptyText={emptyTextFor(lane.key, filtersOn)}
              >
                {loading ? null : (
                  <>
                    {/* Wishlist items sit at the top of Planning — they are the least-committed
                        things in the lane, and a vendor-less plan can't become a PO card. */}
                    {lane.key === "planning" &&
                      planned.map((p) => <PlannedCard key={p.id} plan={p} onEdit={() => openEditPlan(p)} canEdit={can("edit")} />)}
                    {poByLane[lane.key].map((po) => (
                      <POCard key={po.id} po={po} due={dues.get(po.id)} lane={lane.key} canEdit={can("edit")} onAdvance={dropPO} onOpen={() => setActivePO(po.id)} />
                    ))}
                  </>
                )}
              </Lane>
            ))}
          </div>
        </DndProvider>
      )}

      <div aria-live="polite" className="sr-only">{announce}</div>
      <PlannedDialog open={planOpen} onOpenChange={setPlanOpen} editing={planEditing} prefill={planPrefill} />
      <PurchaseOrderDrawer id={activePO} open={!!activePO} onOpenChange={(o) => { if (!o) setActivePO(null); }} />
    </section>
  );
}

function emptyTextFor(lane: BoardLane, filtersOn: boolean): string {
  if (filtersOn) return "No matches";
  if (lane === "arrived") return "Received POs land here";
  if (DROP_ACCEPT[lane].length) return "Drop a PO here";
  return "Empty";
}

function Lane({ lane, label, count, canEdit, onDropPO, onDropPlan, children, loading, empty, emptyText }: {
  lane: BoardLane; label: string; count: number; canEdit: boolean;
  onDropPO: (id: string, lane: DropLane) => void;
  onDropPlan: (id: string) => void;
  children: React.ReactNode; loading: boolean; empty: boolean; emptyText: string;
}) {
  const accept = DROP_ACCEPT[lane];
  const droppable = canEdit && accept.length > 0;
  const [{ isOver }, drop] = useDrop(
    () => ({
      accept,
      canDrop: () => droppable,
      drop: (item: { id: string }, monitor) => {
        if (monitor.getItemType() === DND_PLAN) onDropPlan(item.id);
        else if (accept.includes(DND_PO)) onDropPO(item.id, lane as DropLane);
      },
      collect: (m) => ({ isOver: m.isOver() && m.canDrop() }),
    }),
    [lane, droppable, onDropPO, onDropPlan],
  );

  return (
    <div
      ref={drop as unknown as Ref<HTMLDivElement>}
      role="region"
      aria-label={`${label}: ${count}`}
      className={cn(
        "flex min-w-[216px] flex-col rounded-md border border-border bg-secondary/30 transition-colors motion-reduce:transition-none",
        isOver && "border-[#cc0000] bg-[#cc0000]/5",
      )}
    >
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm">{label}</h4>
          <span className="rounded-sm bg-black px-1.5 text-xs text-white tabular-nums">{count}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {loading ? (
          <>
            <Skeleton className="h-[72px] rounded-md" />
            <Skeleton className="h-[72px] rounded-md" />
          </>
        ) : (
          children
        )}
        {empty && <p className="px-1 py-6 text-center text-xs text-muted-foreground/70">{emptyText}</p>}
      </div>
    </div>
  );
}

function POCard({ po, due, lane, canEdit, onAdvance, onOpen }: {
  po: PurchaseOrderListRow; due: PODue | undefined; lane: BoardLane;
  canEdit: boolean; onAdvance: (id: string, lane: DropLane) => void; onOpen: () => void;
}) {
  const payStatus = due ? paymentStatusOf(due) : null;
  const next = LANE_NEXT[lane];

  // The time that matters for this stage: an arrival countdown in transit (red if overdue),
  // otherwise the received / ordered date, falling back to how long ago it was added.
  const eta = lane === "transit" ? etaLabel(po.expected_on) : null;
  const time = eta
    ? { text: eta.text, overdue: eta.overdue }
    : lane === "arrived" && po.received_on
      ? { text: `Received ${formatDate(po.received_on)}`, overdue: false }
      : po.ordered_on
        ? { text: `Ordered ${formatDate(po.ordered_on)}`, overdue: false }
        : { text: `Added ${timeAgo(po.created_at)}`, overdue: false };

  const [{ isDragging }, drag] = useDrag(
    () => ({ type: DND_PO, item: { id: po.id }, canDrag: canEdit, collect: (m) => ({ isDragging: m.isDragging() }) }),
    [po.id, po.status, canEdit],
  );

  return (
    <div
      ref={drag as unknown as Ref<HTMLDivElement>}
      role="button"
      tabIndex={0}
      aria-label={`${po.po_no ?? "PO"}, ${po.suppliers?.name ?? "vendor"}. Enter to open.`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-md border border-border bg-card p-3 text-left transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cc0000]/40 motion-reduce:transition-none",
        canEdit && "active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{po.po_no ?? "—"}</span>
        {payStatus && <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", PAYMENT_TONE[payStatus])}>{PAYMENT_LABEL[payStatus]}</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">{po.suppliers?.name ?? "—"}</span>
        <span className={cn("shrink-0 whitespace-nowrap text-[11px] tabular-nums", time.overdue ? "font-medium text-[#cc0000]" : "text-muted-foreground")}>{time.text}</span>
      </div>
      <span className="tabular-nums text-sm font-semibold [font-family:var(--font-heading)]">
        {due ? formatCompact(due.cost) : <span className="text-xs font-normal text-muted-foreground">{po.line_count} {po.line_count === 1 ? "line" : "lines"}</span>}
      </span>
      <div className="flex items-center justify-between gap-2">
        {due && due.due > 0 ? <span className="text-[11px] tabular-nums text-amber-700">{formatPKR(due.due)} due</span> : <span />}
        {canEdit && next?.kind === "advance" && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Move ${po.po_no ?? "PO"} to ${next.label}`}
            className="h-6 gap-1 px-1.5 text-[11px] text-[#cc0000] hover:bg-[#cc0000]/10 hover:text-[#cc0000]"
            onClick={(e) => { e.stopPropagation(); onAdvance(po.id, next.lane); }}
          >
            {next.label} <ChevronRight className="size-3" />
          </Button>
        )}
        {canEdit && next?.kind === "receive" && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Receive ${po.po_no ?? "PO"}`}
            className="h-6 gap-1 px-1.5 text-[11px] text-[#cc0000] hover:bg-[#cc0000]/10 hover:text-[#cc0000]"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
          >
            <PackageCheck className="size-3" /> Receive
          </Button>
        )}
      </div>
    </div>
  );
}

function PlannedCard({ plan, onEdit, canEdit }: { plan: PlannedPurchase; onEdit: () => void; canEdit: boolean }) {
  const navigate = useNavigate();
  const graduate = useGraduatePlanned();
  const canGraduate = !!plan.product_id && !!plan.supplier_id && plan.status !== "ordered" && plan.status !== "dropped";
  const est = plan.planned_qty != null && plan.est_unit_cost_pkr != null ? plan.planned_qty * plan.est_unit_cost_pkr : null;

  // Every planned card is a drag source (you can try to drag any of them onto Ordered); an
  // ineligible one is rejected on drop with a reason, rather than silently refusing to move.
  const [{ isDragging }, drag] = useDrag(
    () => ({ type: DND_PLAN, item: { id: plan.id }, canDrag: canEdit, collect: (m) => ({ isDragging: m.isDragging() }) }),
    [plan.id, canEdit],
  );

  async function doGraduate(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const poId = await graduate.mutateAsync(plan.id);
      toast.success("Turned into a purchase order");
      navigate(`/purchasing/${poId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the PO");
    }
  }

  // Whole card is the drag + click target (click opens edit), matching the PO cards. "To PO" is
  // the only nested action, and stops propagation.
  return (
    <div
      ref={drag as unknown as Ref<HTMLDivElement>}
      data-plan-card
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : undefined}
      aria-label={canEdit ? `${plan.item_name}. Enter to edit, drag to Ordered to turn into a PO.` : undefined}
      onClick={canEdit ? onEdit : undefined}
      onKeyDown={canEdit ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(); } } : undefined}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border border-border bg-card p-3",
        canEdit && "cursor-pointer active:cursor-grabbing hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cc0000]/40 motion-reduce:transition-none",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight text-foreground">{plan.item_name}</span>
        <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", PRIORITY_TONE[plan.priority])}>{PRIORITY_LABEL[plan.priority]}</span>
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {plan.suppliers?.name ?? "Vendor undecided"}
        {!plan.product_id && <span className="text-amber-600"> · not a product yet</span>}
      </span>
      <div className="flex items-center justify-between gap-2">
        <span className="tabular-nums text-xs text-muted-foreground">{est != null ? `~${formatCompact(est)}` : ""}</span>
        {canEdit && (
          <Button
            size="sm"
            className="h-6 gap-1 bg-[#cc0000] px-2 text-[11px] text-white hover:bg-[#a30000] disabled:opacity-50"
            disabled={!canGraduate || graduate.isPending}
            title={canGraduate ? "Create a purchase order from this item" : "Link a product and a vendor first"}
            onClick={doGraduate}
          >
            <ArrowUpRight className="size-3" /> To PO
          </Button>
        )}
      </div>
    </div>
  );
}
