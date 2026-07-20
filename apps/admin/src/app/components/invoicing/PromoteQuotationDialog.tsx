// Promote a quotation → invoice. Before the invoice is raised, the operator reviews the lines
// and sets the FINAL unit cost/price of each item (pre-filled from the quote). Out-of-stock
// items are flagged (the order still lands on the pipeline; stock is drawn at fulfilment).
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useProducts } from "../../data/catalog";
import type { PromoteLine, QuotationRecord } from "../../data/quotations";
import { formatPKR } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@360/ui/dialog";

interface DraftLine {
  // Row identity. NOT product_id — a one-off line has none, so several rows would share ""
  // and edit/remove in lockstep.
  key: string;
  product_id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  shipping_type: "sea" | "air";
  qty: number;
  price: number;
}

export function PromoteQuotationDialog({
  quote,
  open,
  onOpenChange,
  onConfirm,
  submitting,
}: {
  quote: QuotationRecord | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (lines: PromoteLine[]) => void;
  submitting: boolean;
}) {
  const productsQ = useProducts();
  const [lines, setLines] = useState<DraftLine[]>([]);

  useEffect(() => {
    if (open && quote) {
      setLines(
        // One-off (product-less) lines are promoted too — filtering them out here dropped them
        // from the invoice, which then totalled less than the quotation.
        quote.items.map((i, idx) => ({
          key: i.id ?? `line-${idx}`,
          product_id: i.product_id,
          name: i.name,
          sku: i.sku,
          brand: i.brand ?? null,
          shipping_type: i.shipping_type,
          qty: i.qty,
          price: i.price_pkr,
        })),
      );
    }
  }, [open, quote]);

  const outOfStockIds = useMemo(
    () => new Set((productsQ.data ?? []).filter((p) => p.availability === "out_of_stock").map((p) => p.id)),
    [productsQ.data],
  );
  const outOfStockLines = lines.filter((l) => outOfStockIds.has(l.product_id));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  function setQty(key: string, qty: number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.floor(qty || 1)) } : l)));
  }
  function setPrice(key: string, price: number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, price: Math.max(0, price || 0) } : l)));
  }

  function submit() {
    if (lines.length === 0) return;
    onConfirm(lines.map((l) => ({ product_id: l.product_id, qty: l.qty, price_pkr: l.price, shipping_type: l.shipping_type, name: l.name, sku: l.sku, brand: l.brand })));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Promote {quote?.quote_no ?? "quotation"} to invoice</DialogTitle>
          <DialogDescription>Set the final cost of each item. This raises the invoice (the quotation stays unchanged); start the order pipeline from the invoice afterwards.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-border">
            {lines.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No product lines to invoice.</p>
            ) : (
              <div className="divide-y divide-border">
                {lines.map((l) => (
                  <div key={l.key} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {l.name}
                        {outOfStockIds.has(l.product_id) && <span className="ml-2 rounded-full border border-[#cc0000]/30 bg-[#cc0000]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#cc0000]">Out of stock</span>}
                      </p>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{l.sku ?? "—"} · {l.shipping_type === "air" ? "Air" : "Sea"}</p>
                    </div>
                    <Input aria-label="Quantity" type="number" min={1} value={l.qty} onChange={(e) => setQty(l.key, Number(e.target.value))} className="w-14" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input aria-label="Final unit price" type="number" min={0} value={l.price} onChange={(e) => setPrice(l.key, Number(e.target.value))} className="w-28" />
                    <span className="w-24 text-right text-sm tabular-nums">{formatPKR(l.price * l.qty)}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}>
                      <Trash2 className="size-4 text-[#cc0000]" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {outOfStockLines.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-md border border-[#cc0000]/30 bg-[#cc0000]/10 p-3 text-sm text-[#cc0000]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {outOfStockLines.length === 1 ? "1 item is" : `${outOfStockLines.length} items are`} out of stock
                {" "}({outOfStockLines.map((l) => l.name).join(", ")}). You can still invoice. Items are sourced before fulfilment once it&apos;s on the pipeline.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="[font-family:var(--font-heading)] uppercase tracking-wide">Invoice total</span>
            <span className="[font-family:var(--font-heading)] text-xl font-bold tabular-nums">{formatPKR(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={lines.length === 0 || submitting}>
            {submitting ? "Creating…" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
