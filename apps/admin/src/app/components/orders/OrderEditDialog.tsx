// Edit an order's line items. Allowed only before any line is delivered (the update_order RPC
// enforces it; the UI hides the button otherwise) — once stock is drawn at fulfilment, the lines
// are locked. Prices follow the customer's tier by default; the operator can override any line.
import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useProducts } from "../../data/catalog";
import { useUpdateOrder, type OrderRow } from "../../data/orders";
import { formatPKR } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@360/ui/dialog";

// A draft line is either a catalogue product or a one-off. update_order deletes and re-inserts the
// whole item set from this payload, so one-off lines MUST survive the round trip — dropping them
// here silently deletes them (and their money) from the order.
interface DraftItem {
  key: string;
  product_id: string | null;
  name: string;
  sku: string | null;
  price: number;
  qty: number;
  // One-off lines only: the catalogue link + the cost snapshot the P&L reads.
  oneoff_product_id: string | null;
  landed_cost_pkr: number;
}

export function OrderEditDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const productsQ = useProducts();
  const update = useUpdateOrder();
  const [items, setItems] = useState<DraftItem[]>([]);
  const [productQuery, setProductQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setItems(
      order.order_items.map((it) => ({
        key: it.id,
        product_id: it.product_id,
        name: it.name,
        sku: it.sku,
        price: it.price_pkr,
        qty: it.qty,
        oneoff_product_id: it.oneoff_product_id,
        landed_cost_pkr: it.landed_cost_pkr ?? 0,
      })),
    );
    setProductQuery("");
  }, [open, order]);

  const sellable = useMemo(() => (productsQ.data ?? []).filter((p) => p.visibility === "visible"), [productsQ.data]);
  const matches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return sellable.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 6);
  }, [sellable, productQuery]);
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.qty, 0), [items]);

  function addProduct(p: (typeof sellable)[number]) {
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === p.id);
      if (found) return prev.map((i) => (i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [
        ...prev,
        { key: p.id, product_id: p.id, name: p.name, sku: p.sku, price: p.price_pkr ?? 0, qty: 1, oneoff_product_id: null, landed_cost_pkr: 0 },
      ];
    });
    setProductQuery("");
  }

  async function save() {
    if (items.length === 0) return;
    try {
      await update.mutateAsync({
        id: order.id,
        items: items.map((i) =>
          i.product_id
            ? { product_id: i.product_id, qty: i.qty, price_pkr: i.price }
            : {
                product_id: "",
                name: i.name,
                sku: i.sku,
                qty: i.qty,
                price_pkr: i.price,
                oneoff_product_id: i.oneoff_product_id,
                landed_cost_pkr: i.landed_cost_pkr,
              },
        ),
      });
      toast.success("Order updated");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not update the order.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {order.order_no}</DialogTitle>
          <DialogDescription>Adjust the items before any are delivered. Prices default to the customer&apos;s tier; override any line.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Add product</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search by SKU or name…" className="pl-9" />
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
          </div>

          <div className="rounded-md border border-border">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No items. An order needs at least one.</p>
            ) : (
              <div className="divide-y divide-border">
                {items.map((i) => (
                  <div key={i.key} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {i.name}
                        {!i.product_id && <span className="ml-2 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">One-off</span>}
                      </p>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{i.sku ?? "—"}</p>
                    </div>
                    <Input aria-label="Quantity" type="number" min={1} value={i.qty}
                      onChange={(e) => setItems((prev) => prev.map((x) => x.key === i.key ? { ...x, qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : x))}
                      className="w-14" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input aria-label="Unit price" type="number" min={0} value={i.price}
                      onChange={(e) => setItems((prev) => prev.map((x) => x.key === i.key ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x))}
                      className="w-24" />
                    <span className="w-24 text-right text-sm tabular-nums">{formatPKR(i.price * i.qty)}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))}>
                      <Trash2 className="size-4 text-[#cc0000]" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-border pt-3 text-right">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Order total</p>
              <p className="[font-family:var(--font-heading)] text-xl font-bold tabular-nums">{formatPKR(subtotal)}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={save} disabled={items.length === 0 || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
