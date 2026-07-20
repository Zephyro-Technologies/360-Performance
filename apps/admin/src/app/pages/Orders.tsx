// Module 5 — Order Pipeline. Kanban (react-dnd) over Supabase. Drag or one-click
// advances the stage; a DB trigger records every transition in order_stage_events.
import { useEffect, useMemo, useState, type Ref } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/common/PageHeader";
import { Input } from "@360/ui/input";
import { OrderDetail } from "../components/orders/OrderDetail";
import { CreateOrderDialog } from "../components/orders/CreateOrderDialog";
import {
  useOrders,
  useSetOrderStage,
  nextStage,
  ALL_STAGES,
  DERIVED_STAGES,
  STAGE_LABEL,
  columnStageOf,
  isTerminalStage,
  type OrderRow,
  type OrderStage,
} from "../data/orders";
import { useAuth } from "../data/auth";
import { useProducts, useCategories, groupCategories } from "../data/catalog";
import { formatPKR, formatDate, timeAgo } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Tabs, TabsList, TabsTrigger } from "@360/ui/tabs";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@360/ui/table";
import { useTableSort, SortHead } from "../components/common/useTableSort";
import { Button } from "@360/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";

// Card ordering within each column.
type OrderSort = "newest" | "oldest" | "value_high" | "value_low" | "customer";
const SORT_LABEL: Record<OrderSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  value_high: "Value: high to low",
  value_low: "Value: low to high",
  customer: "Customer A–Z",
};
const SORT_CMP: Record<OrderSort, (a: OrderRow, b: OrderRow) => number> = {
  newest: (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0),
  oldest: (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0),
  value_high: (a, b) => b.total_pkr - a.total_pkr,
  value_low: (a, b) => a.total_pkr - b.total_pkr,
  customer: (a, b) => (a.customers?.name ?? "").localeCompare(b.customers?.name ?? ""),
};

const STAGE_ACCENT: Record<OrderStage, string> = {
  received: "bg-black",
  processing: "bg-amber-500",
  sourcing: "bg-amber-600",
  ready_to_ship: "bg-blue-600",
  shipped: "bg-indigo-600",
  partially_delivered: "bg-emerald-500",
  delivered: "bg-emerald-600",
  cancelled: "bg-[#cc0000]",
};

const DND_TYPE = "ORDER_CARD";

// Lines still needing stock (not fully delivered) whose product is out of stock. Used both for the
// card heads-up and to block an order from advancing to Ready to Ship / Shipped while short.
function shortItemCount(order: OrderRow, outOfStockIds: Set<string>): number {
  if (order.stage === "cancelled") return 0;
  return order.order_items.filter((it) => it.product_id && outOfStockIds.has(it.product_id) && it.qty_delivered < it.qty).length;
}

function OrderCard({ order, onOpen, onStage, outOfStockIds }: { order: OrderRow; onOpen: () => void; onStage: (id: string, stage: OrderStage) => void; outOfStockIds: Set<string> }) {
  const { can } = useAuth();
  const upcoming = nextStage(order.stage);
  const shortItems = shortItemCount(order, outOfStockIds);

  // Delivered / partially-delivered / cancelled orders are terminal — not draggable (moving them
  // would desync fulfilment or silently un-cancel). onStage backstops this too.
  const [{ isDragging }, drag] = useDrag(
    () => ({ type: DND_TYPE, item: { id: order.id }, canDrag: can("edit") && !isTerminalStage(order.stage), collect: (m) => ({ isDragging: m.isDragging() }) }),
    [order.id, order.stage],
  );

  return (
    <div
      ref={drag as unknown as Ref<HTMLDivElement>}
      role="button"
      tabIndex={0}
      aria-label={`Order ${order.order_no}, ${order.customers?.name ?? "customer"}, ${STAGE_LABEL[order.stage]}. Press Enter to open.`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "cursor-pointer rounded-md border border-border bg-card p-3 transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cc0000]/40 motion-reduce:transition-none",
        isDragging && "opacity-40",
        can("edit") && "active:cursor-grabbing",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="[font-family:var(--font-heading)] text-sm font-semibold tabular-nums">{order.order_no}</span>
        <span className="text-xs text-muted-foreground">{timeAgo(order.created_at)}</span>
      </div>
      {order.replaces_order_id && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Replacement re-ship</span>
      )}
      <p className="mt-1 truncate text-sm">{order.customers?.name}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{order.order_items.length} item(s)</p>
      {shortItems > 0 && (
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#cc0000]/30 bg-[#cc0000]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#cc0000]">
          <AlertTriangle className="size-3" /> {shortItems} item{shortItems === 1 ? "" : "s"} out of stock
        </span>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold tabular-nums">{formatPKR(order.total_pkr)}</span>
        {can("edit") && upcoming && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Advance order ${order.order_no} to ${STAGE_LABEL[upcoming]}`}
            className="h-7 gap-1 px-2 text-xs text-[#cc0000] hover:bg-[#cc0000]/10 hover:text-[#cc0000]"
            onClick={(e) => { e.stopPropagation(); onStage(order.id, upcoming); }}
          >
            {STAGE_LABEL[upcoming]} <ChevronRight className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// Table view: every order in one sortable list. Row click opens the full order page.
function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const navigate = useNavigate();
  const sort = useTableSort(
    orders,
    {
      order: (o) => o.order_no,
      customer: (o) => o.customers?.name ?? null,
      status: (o) => ALL_STAGES.indexOf(o.stage),
      items: (o) => o.order_items.length,
      total: (o) => o.total_pkr,
      placed: (o) => o.created_at,
    },
    "placed",
    "desc",
  );
  return (
    <div className="flex-1 overflow-auto rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-black hover:bg-black">
            <SortHead label="Order" sortKey="order" sort={sort} className="text-white whitespace-nowrap" />
            <SortHead label="Customer" sortKey="customer" sort={sort} className="text-white whitespace-nowrap" />
            <SortHead label="Status" sortKey="status" sort={sort} className="text-white whitespace-nowrap" />
            <SortHead label="Items" sortKey="items" sort={sort} className="text-white whitespace-nowrap text-right" align="right" />
            <SortHead label="Total" sortKey="total" sort={sort} className="text-white whitespace-nowrap text-right" align="right" />
            <SortHead label="Placed" sortKey="placed" sort={sort} className="text-white whitespace-nowrap" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sort.sorted.map((o) => (
            <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
              <TableCell className="font-mono font-medium">{o.order_no ?? "—"}</TableCell>
              <TableCell>{o.customers?.name ?? "—"}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                  <span className={cn("size-2 rounded-full", STAGE_ACCENT[o.stage])} aria-hidden />{STAGE_LABEL[o.stage]}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{o.order_items.length}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">{formatPKR(o.total_pkr)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(o.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sort.sorted.length === 0 && <p className="p-6 text-center text-muted-foreground">No orders match your filters.</p>}
    </div>
  );
}

function Column({ stage, orders, onOpen, onStage, outOfStockIds }: { stage: OrderStage; orders: OrderRow[]; onOpen: (o: OrderRow) => void; onStage: (id: string, stage: OrderStage) => void; outOfStockIds: Set<string> }) {
  const { can } = useAuth();

  // Derived delivery stages (partially_delivered / delivered) are set by fulfilling lines,
  // never by a manual drop — so they don't accept drops.
  const droppable = can("edit") && !DERIVED_STAGES.includes(stage);
  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: DND_TYPE,
      canDrop: () => droppable,
      drop: (item: { id: string }) => onStage(item.id, stage),
      collect: (m) => ({ isOver: m.isOver() && m.canDrop() }),
    }),
    [stage, droppable],
  );

  const total = orders.reduce((s, o) => s + o.total_pkr, 0);

  return (
    <div
      ref={drop as unknown as Ref<HTMLDivElement>}
      role="region"
      aria-label={`${STAGE_LABEL[stage]}: ${orders.length} order(s)`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-md border border-border bg-secondary/50 transition-colors motion-reduce:transition-none",
        isOver && "border-[#cc0000] bg-[#cc0000]/5",
      )}
    >
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", STAGE_ACCENT[stage])} />
          <h4 className="text-sm">{STAGE_LABEL[stage]}</h4>
          <span className="rounded-sm bg-black px-1.5 text-xs text-white tabular-nums">{orders.length}</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2 scrollbar-hide">
        {orders.map((o) => <OrderCard key={o.id} order={o} onOpen={() => onOpen(o)} onStage={onStage} outOfStockIds={outOfStockIds} />)}
        {orders.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">{droppable ? "Drop orders here" : "Set by delivering lines"}</p>}
      </div>
      {total > 0 && (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground tabular-nums">{formatPKR(total)}</div>
      )}
    </div>
  );
}

export function Orders() {
  const ordersQ = useOrders();
  const productsQ = useProducts();
  const categoriesQ = useCategories();
  const setStage = useSetOrderStage();
  const { can } = useAuth();
  // Physical no-stock by REAL on-hand units, not the availability LABEL: a "made to order" product
  // (the default for new products) reads availability 'made_to_order' even at zero stock, so a
  // label check let out-of-stock items slip through to Ready to Ship. on_hand_qty is the truth.
  const outOfStockIds = useMemo(
    () => new Set((productsQ.data ?? []).filter((p) => p.on_hand_qty <= 0).map((p) => p.id)),
    [productsQ.data],
  );
  const [active, setActive] = useState<OrderRow | null>(null);
  const [view, setView] = useState<"board" | "table">("board");
  const [announcement, setAnnouncement] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<OrderSort>("newest");

  const orders = ordersQ.data ?? [];

  // Category filter: orders carry no category, so map each line's product to its leaf category and
  // match if any line falls in the chosen category (a parent = itself + its leaves).
  const catGroups = useMemo(() => groupCategories(categoriesQ.data ?? []), [categoriesQ.data]);
  const productCat = useMemo(() => new Map((productsQ.data ?? []).map((p) => [p.id, p.category_id])), [productsQ.data]);
  const catSet = useMemo(() => {
    if (category === "all") return null;
    const children = (categoriesQ.data ?? []).filter((c) => c.parent_id === category).map((c) => c.id);
    return new Set([category, ...children]);
  }, [category, categoriesQ.data]);

  const term = query.trim().toLowerCase();
  const filtered = orders
    .filter((o) => {
      if (term && !((o.order_no ?? "").toLowerCase().includes(term) || (o.customers?.name ?? "").toLowerCase().includes(term) || (o.customers?.phone ?? "").toLowerCase().includes(term))) return false;
      if (catSet && !o.order_items.some((it) => it.product_id && productCat.get(it.product_id) && catSet.has(productCat.get(it.product_id)!))) return false;
      return true;
    })
    .sort(SORT_CMP[sortBy]);

  // Open a specific order's drawer when linked in via /orders?order=<id> (e.g. from an invoice).
  // Waits for the orders list to load, then strips the param.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get("order");
    if (!id || orders.length === 0) return;
    const o = orders.find((x) => x.id === id);
    if (o) setActive(o);
    const next = new URLSearchParams(params);
    next.delete("order");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, orders]);

  async function onStage(id: string, stage: OrderStage) {
    if (DERIVED_STAGES.includes(stage)) return; // delivery is per-line (fulfil), not a manual stage move
    const order = orders.find((o) => o.id === id);
    const orderNo = order?.order_no ?? "";
    // A terminal order (delivered / partially-delivered / cancelled) can't be moved on the board —
    // backstops the drag guard against a stray drop.
    if (order && isTerminalStage(order.stage)) {
      toast.error(`${orderNo || "This order"} is ${STAGE_LABEL[order.stage]} and can't be moved on the board.`);
      return;
    }
    // Sourcing exists to clear out-of-stock items; an order can't advance to Ready to Ship / Shipped
    // while any line is still out of stock (and undelivered). Block it with a clear error.
    if (order && (stage === "ready_to_ship" || stage === "shipped")) {
      const short = shortItemCount(order, outOfStockIds);
      if (short > 0) {
        toast.error(`Can't move ${orderNo || "this order"} to ${STAGE_LABEL[stage]} — ${short} item${short === 1 ? "" : "s"} out of stock. Restock before it can ship.`);
        return;
      }
    }
    try {
      await setStage.mutateAsync({ id, stage });
      setAnnouncement(`Order ${orderNo} moved to ${STAGE_LABEL[stage]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update stage");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Order Pipeline"
        subtitle="Drag cards across stages, one-click advance, history is recorded"
        actions={can("edit") && <CreateOrderDialog />}
      />
      <Tabs value={view} onValueChange={(v) => setView(v as "board" | "table")} className="mb-4 w-full">
        <TabsList className="h-12 w-full">
          <TabsTrigger value="board" className="text-base font-medium">Board</TabsTrigger>
          <TabsTrigger value="table" className="text-base font-medium">Table</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-sm sm:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by order #, customer, or phone…" className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
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
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as OrderSort)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Sort orders"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as OrderSort[]).map((s) => <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {ordersQ.isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Loading orders…</p>
      ) : ordersQ.isError ? (
        <p className="py-16 text-center text-[#cc0000]">{(ordersQ.error as Error).message}</p>
      ) : view === "table" ? (
        <OrdersTable orders={filtered} />
      ) : (
        <DndProvider backend={HTML5Backend}>
          <div className="flex flex-1 gap-3 overflow-x-auto pb-4 scrollbar-hide">
            {ALL_STAGES.map((stage) => (
              <Column key={stage} stage={stage} orders={filtered.filter((o) => columnStageOf(o.stage) === stage)} onOpen={setActive} onStage={onStage} outOfStockIds={outOfStockIds} />
            ))}
          </div>
        </DndProvider>
      )}
      <div aria-live="polite" className="sr-only">{announcement}</div>
      <OrderDetail
        order={active ? orders.find((o) => o.id === active.id) ?? null : null}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
      />
    </div>
  );
}
