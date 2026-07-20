// Edit a quotation's lines + notes. Unlike invoices, a quote is a freely-editable estimate
// (no payment/void gate), so this just re-keys the lines via update_quotation.
import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProducts } from "../../data/catalog";
import { useUpdateQuotation, type QuotationRecord } from "../../data/quotations";
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
} from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";

type ShippingType = "sea" | "air";

interface DraftItem {
  // Row identity. NOT product_id — a one-off line has none, so several rows would share ""
  // and edit/remove in lockstep.
  key: string;
  product_id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  shipping_type: ShippingType;
  price: number;
  qty: number;
}

export function QuotationEditDialog({
  quote,
  open,
  onOpenChange,
}: {
  quote: QuotationRecord;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const productsQ = useProducts();
  const update = useUpdateQuotation();
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState("");
  const [productQuery, setProductQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    // Product-less (one-off) lines are kept — they used to be filtered out here, which silently
    // deleted them from the quote on save. update_quotation handles them (migration 090105).
    setItems(
      quote.items.map((it, idx) => ({
        key: it.id ?? `line-${idx}`,
        product_id: it.product_id,
        name: it.name,
        sku: it.sku,
        brand: it.brand ?? null,
        shipping_type: it.shipping_type,
        price: it.price_pkr,
        qty: it.qty,
      })),
    );
    setNotes(quote.notes ?? "");
    setProductQuery("");
  }, [open, quote]);

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
      return [...prev, { key: p.id, product_id: p.id, name: p.name, sku: p.sku, brand: null, shipping_type: "sea", price: p.price_pkr ?? 0, qty: 1 }];
    });
    setProductQuery("");
  }

  async function save() {
    if (items.length === 0) return;
    try {
      await update.mutateAsync({
        id: quote.id,
        notes: notes.trim(),
        items: items.map((i) => ({ product_id: i.product_id, name: i.name, sku: i.sku, brand: i.brand, shipping_type: i.shipping_type, price_pkr: i.price, qty: i.qty })),
      });
      toast.success("Quotation updated");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the quotation.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {quote.quote_no}</DialogTitle>
          <DialogDescription>Adjust the lines, prices, shipping and notes. The quote number and customer stay the same.</DialogDescription>
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
                      <span className="shrink-0 text-sm tabular-nums">{p.price_pkr === null ? "—" : formatPKR(p.price_pkr)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Quote validity, delivery notes, special terms…" />
          </div>

          <div className="rounded-md border border-border">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No items. A quotation needs at least one.</p>
            ) : (
              <div className="divide-y divide-border">
                {items.map((i) => (
                  <div key={i.key} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.name}</p>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{i.sku ?? "—"}</p>
                    </div>
                    <Input aria-label="Quantity" type="number" min={1} value={i.qty}
                      onChange={(e) => setItems((prev) => prev.map((x) => x.key === i.key ? { ...x, qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : x))}
                      className="w-14" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Select value={i.shipping_type} onValueChange={(v) => setItems((prev) => prev.map((x) => x.key === i.key ? { ...x, shipping_type: v as ShippingType } : x))}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sea">Sea</SelectItem>
                        <SelectItem value="air">Air</SelectItem>
                      </SelectContent>
                    </Select>
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
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
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
