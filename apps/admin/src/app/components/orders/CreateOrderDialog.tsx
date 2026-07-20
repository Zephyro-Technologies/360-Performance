// Create a new order: pick/add a customer, add catalogue line items and/or one-off products
// (non-catalogue items), optional note. Saved via the create_order RPC. New orders enter at "received".
import { useEffect, useMemo, useState } from "react";
import { useOpenOnNewParam } from "../../lib/useOpenOnNewParam";
import { AlertTriangle, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useProducts } from "../../data/catalog";
import { useOneoffProducts, type OneoffProduct } from "../../data/oneoffProducts";
import { useCreateOrder, type CreateOrderInput } from "../../data/orders";
import { useCreateInvoice } from "../../data/invoices";
import { OneoffProductDialog } from "../products/OneoffProductDialog";
import { CustomerStep, selType, tierPrice, type CustomerSelection } from "../shared/CustomerStep";
import { formatPKR } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@360/ui/dialog";

interface DraftItem {
  key: string;                       // product_id for catalogue, oneoff_product_id for one-off
  product_id: string;                // "" for a one-off line
  oneoff_product_id: string | null;
  name: string;
  sku: string | null;
  retail: number | null;
  reseller: number | null;
  price: number;
  landed_cost: number;               // 0 for catalogue lines
  qty: number;
  overridden: boolean;
  isOneoff: boolean;
}

export function CreateOrderDialog() {
  const productsQ = useProducts();
  const oneoffQ = useOneoffProducts();
  const create = useCreateOrder();
  const createInvoice = useCreateInvoice();
  const [open, setOpen] = useState(false);
  useOpenOnNewParam(() => setOpen(true)); // topbar "+ New → Order"
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [oneoffQuery, setOneoffQuery] = useState("");
  const [oneoffDialogOpen, setOneoffDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [alsoInvoice, setAlsoInvoice] = useState(false);

  const sellable = useMemo(
    () => (productsQ.data ?? []).filter((p) => p.visibility === "visible"),
    [productsQ.data],
  );
  const matches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return sellable.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 6);
  }, [sellable, productQuery]);
  const oneoffMatches = useMemo(() => {
    const q = oneoffQuery.trim().toLowerCase();
    if (!q) return [];
    return (oneoffQ.data ?? []).filter((p) => p.name.toLowerCase().includes(q) || (p.oem_part_no ?? "").toLowerCase().includes(q)).slice(0, 6);
  }, [oneoffQ.data, oneoffQuery]);
  const total = useMemo(() => items.reduce((s, i) => s + i.price * i.qty, 0), [items]);
  const custType = selType(customer);
  const reseller = custType === "trade" || custType === "workshop";
  const outOfStockIds = useMemo(
    () => new Set((productsQ.data ?? []).filter((p) => p.availability === "out_of_stock").map((p) => p.id)),
    [productsQ.data],
  );
  const outOfStockLines = items.filter((i) => !i.isOneoff && outOfStockIds.has(i.product_id));

  function addProduct(p: (typeof sellable)[number]) {
    setItems((prev) => {
      const found = prev.find((i) => i.key === p.id);
      if (found) return prev.map((i) => (i.key === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { key: p.id, product_id: p.id, oneoff_product_id: null, name: p.name, sku: p.sku, retail: p.price_pkr, reseller: p.reseller_price_pkr, price: tierPrice(p.price_pkr, p.reseller_price_pkr, custType), landed_cost: 0, qty: 1, overridden: false, isOneoff: false }];
    });
    setProductQuery("");
  }

  function addOneoff(op: OneoffProduct) {
    setItems((prev) => {
      const found = prev.find((i) => i.key === op.id);
      if (found) return prev.map((i) => (i.key === op.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { key: op.id, product_id: "", oneoff_product_id: op.id, name: op.name, sku: op.oem_part_no, retail: null, reseller: null, price: op.sale_price_pkr, landed_cost: op.landed_cost_pkr, qty: 1, overridden: false, isOneoff: true }];
    });
    setOneoffQuery("");
  }

  function setQty(key: string, qty: number) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.floor(qty || 1)) } : i)));
  }
  function setPrice(key: string, price: number) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, price: Math.max(0, price || 0), overridden: true } : i)));
  }

  // Re-default non-overridden CATALOGUE lines when the customer (pricing tier) changes.
  useEffect(() => {
    setItems((prev) => prev.map((i) => (i.overridden || i.isOneoff ? i : { ...i, price: tierPrice(i.retail, i.reseller, custType) })));
  }, [custType]);

  function reset() {
    setCustomer(null);
    setItems([]);
    setProductQuery("");
    setOneoffQuery("");
    setNotes("");
    setAlsoInvoice(false);
  }

  async function save() {
    if (!customer || items.length === 0) return;
    const lineItems = items.map((i) =>
      i.isOneoff
        ? { product_id: "", name: i.name, qty: i.qty, price_pkr: i.price, oneoff_product_id: i.oneoff_product_id, landed_cost_pkr: i.landed_cost }
        : { product_id: i.product_id, qty: i.qty, price_pkr: i.price },
    );
    const input: CreateOrderInput = {
      customer_id: customer.kind === "existing" ? customer.id : null,
      new_customer: customer.kind === "new" ? customer.draft : null,
      items: lineItems,
      notes: notes.trim() || null,
    };
    try {
      const order = (await create.mutateAsync(input)) as { id: string; customer_id: string } | null;
      if (alsoInvoice && order?.id) {
        try {
          await createInvoice.mutateAsync({
            customer_id: order.customer_id,
            new_customer: null,
            order_id: order.id,
            items: lineItems.map((li) => ({ ...li, shipping_type: "sea" as const })),
            due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          });
          toast.success("Order created & invoiced");
        } catch (ie) {
          toast.error(`Order created, but the invoice failed: ${ie instanceof Error ? ie.message : "unknown error"}`);
        }
      } else {
        toast.success("Order created");
      }
      reset();
      setOpen(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not create order.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]">
          <Plus className="size-4" /> New Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Order</DialogTitle>
          <DialogDescription>Choose or add a customer, then add catalogue products and/or one-off products.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <CustomerStep value={customer} onChange={setCustomer} />

          <div className="space-y-2">
            <Label>Add product{reseller && <span className="ml-2 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">Reseller pricing</span>}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search catalogue by SKU or name…" className="pl-9" disabled={!customer} />
              {matches.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-card shadow-md">
                  {matches.map((p) => (
                    <button key={p.id} type="button" onClick={() => addProduct(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{p.sku}</span>
                      <span className="flex-1 truncate text-sm">{p.name}</span>
                      {p.availability === "out_of_stock" && <span className="shrink-0 rounded-full border border-[#cc0000]/30 bg-[#cc0000]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#cc0000]">Out of stock</span>}
                      <span className="shrink-0 text-sm tabular-nums">{p.price_pkr === null ? "—" : formatPKR(p.price_pkr)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!customer && <p className="text-xs text-muted-foreground">Pick a customer first.</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Add one-off product <span className="text-xs font-normal text-muted-foreground">(not in the catalogue)</span></Label>
              <Button type="button" variant="ghost" size="sm" className="text-[#cc0000]" disabled={!customer} onClick={() => setOneoffDialogOpen(true)}><Plus className="size-3.5" /> New</Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={oneoffQuery} onChange={(e) => setOneoffQuery(e.target.value)} placeholder="Search one-off products…" className="pl-9" disabled={!customer} />
              {oneoffMatches.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-card shadow-md">
                  {oneoffMatches.map((p) => (
                    <button key={p.id} type="button" onClick={() => addOneoff(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{p.oem_part_no ?? ""}</span>
                      <span className="flex-1 truncate text-sm">{p.name}</span>
                      <span className="shrink-0 text-sm tabular-nums">{formatPKR(p.sale_price_pkr)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No items yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {items.map((i) => (
                  <div key={i.key} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {i.name}
                        {i.isOneoff && <span className="ml-2 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">One-off</span>}
                        {!i.isOneoff && outOfStockIds.has(i.product_id) && <span className="ml-2 rounded-full border border-[#cc0000]/30 bg-[#cc0000]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#cc0000]">Out of stock</span>}
                      </p>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{i.sku ?? "—"}{i.overridden && <span className="ml-2 text-amber-600">custom price</span>}</p>
                    </div>
                    <Input aria-label="Quantity" type="number" min={1} value={i.qty} onChange={(e) => setQty(i.key, Number(e.target.value))} className="w-14" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input aria-label="Unit price" type="number" min={0} value={i.price} onChange={(e) => setPrice(i.key, Number(e.target.value))} className="w-24" />
                    <span className="w-24 text-right text-sm tabular-nums">{formatPKR(i.price * i.qty)}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))}>
                      <Trash2 className="size-4 text-[#cc0000]" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sourcing notes, customer requests…" rows={2} />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="[font-family:var(--font-heading)] uppercase tracking-wide">Total</span>
            <span className="[font-family:var(--font-heading)] text-xl font-bold tabular-nums">{formatPKR(total)}</span>
          </div>

          {outOfStockLines.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-md border border-[#cc0000]/30 bg-[#cc0000]/10 p-3 text-sm text-[#cc0000]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {outOfStockLines.length === 1 ? "1 item is" : `${outOfStockLines.length} items are`} out of stock
                {" "}({outOfStockLines.map((i) => i.name).join(", ")}). You can still create the order. It&apos;ll be sourced before fulfilment.
              </span>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={alsoInvoice} onChange={(e) => setAlsoInvoice(e.target.checked)} className="size-4 accent-[#cc0000]" />
            Also create an invoice for this order
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={save} disabled={!customer || items.length === 0 || create.isPending || createInvoice.isPending}>
            {create.isPending || createInvoice.isPending ? "Creating…" : alsoInvoice ? "Create Order & Invoice" : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <OneoffProductDialog product={null} open={oneoffDialogOpen} onOpenChange={setOneoffDialogOpen} />
    </Dialog>
  );
}
