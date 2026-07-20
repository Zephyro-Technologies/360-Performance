// Admin-only invoice edit. Issued invoices are otherwise immutable (corrections go via
// payment reversal / void), so this is deliberately narrow — the server (update_invoice,
// migration 20260622090083) refuses a voided invoice or one with ANY payment, and refuses
// a non-admin caller. The UI only hides the button; the DB is the actual guard.
//
// Bank details are edited here too, but they are GLOBAL (the `settings` singleton) — saving
// them changes the payment block on EVERY invoice, not just this one. The banner says so.
import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useProducts } from "../../data/catalog";
import { useUpdateInvoice, lineDiscountPkr, pctFromPrice, priceFromPct, type InvoiceDetailRow } from "../../data/invoices";
import { useSettings, useUpdateBankDetails } from "../../data/settings";
import { tierPrice, type CustomerType } from "../shared/CustomerStep";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import type { ShippingType } from "../../data/invoices";

interface DraftItem {
  // Row identity. NOT product_id — a one-off line has none, so several rows would share "" and
  // edit/remove in lockstep.
  key: string;
  product_id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  shipping_type: ShippingType;
  // The LIST price — what gets stored as price_pkr. Editing the price box does not change this;
  // it back-solves discountPct instead, so the discount is always visible rather than silently
  // baked into a lower price. Typing a HIGHER price does move it (that's a new list price).
  basePrice: number;
  // The effective price after the discount — what the price box shows and what the customer pays.
  price: number;
  qty: number;
  // Whole percent (10 = 10% off). Converted to the fraction the RPC wants on save.
  discountPct: number;
}

export function InvoiceEditDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceDetailRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const productsQ = useProducts();
  const settingsQ = useSettings();
  const update = useUpdateInvoice();
  const saveBank = useUpdateBankDetails();
  // The invoice's customer tier, for pricing lines added here (see addProduct).
  const custType = (invoice.customers?.type ?? null) as CustomerType | null;

  const [items, setItems] = useState<DraftItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [bank, setBank] = useState({ bank_name: "", account_title: "", iban: "" });

  // Reload the draft from the invoice (and the live bank details) each time we open, so a
  // cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setItems(
      invoice.invoice_items.map((it) => ({
        key: it.id,
        product_id: it.product_id ?? "",
        name: it.name,
        sku: it.sku,
        brand: it.brand ?? null,
        shipping_type: it.shipping_type,
        basePrice: it.price_pkr,
        price: priceFromPct(it.price_pkr, Number(it.discount_pct ?? 0) * 100),
        qty: it.qty,
        discountPct: Number(it.discount_pct ?? 0) * 100,
      })),
    );
    setProductQuery("");
    const s = settingsQ.data;
    setBank({
      bank_name: s?.bank_name ?? "",
      account_title: s?.account_title ?? "",
      iban: s?.iban ?? "",
    });
  }, [open, invoice, settingsQ.data]);

  const sellable = useMemo(
    () => (productsQ.data ?? []).filter((p) => p.visibility === "visible"),
    [productsQ.data],
  );
  const matches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return sellable
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 6);
  }, [sellable, productQuery]);
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.basePrice * i.qty, 0), [items]);
  // Mirrors the server: round each line's discount to 2dp, then sum. Computing it on the gross
  // total instead would drift from what create_invoice/update_invoice actually stores.
  const discount = useMemo(() => items.reduce((s, i) => s + lineDiscountPkr(i.basePrice, i.qty, i.discountPct), 0), [items]);

  // Typing an agreed price back-solves the percentage; typing a percentage recomputes the price.
  function setPrice(key: string, next: number) {
    setItems((prev) =>
      prev.map((x) => {
        if (x.key !== key) return x;
        const v = Math.max(0, next || 0);
        // Above the list price this isn't a discount at all — treat it as a new list price.
        if (v >= x.basePrice) return { ...x, basePrice: v, price: v, discountPct: 0 };
        return { ...x, price: v, discountPct: pctFromPrice(x.basePrice, v) };
      }),
    );
  }
  function setPct(key: string, next: number) {
    setItems((prev) =>
      prev.map((x) => {
        if (x.key !== key) return x;
        const pct = Math.min(100, Math.max(0, next || 0));
        return { ...x, discountPct: pct, price: priceFromPct(x.basePrice, pct) };
      }),
    );
  }

  function addProduct(p: (typeof sellable)[number]) {
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === p.id);
      if (found) return prev.map((i) => (i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i));
      // Price by the customer's tier, exactly as the create dialog does — a trade/workshop
      // customer gets the reseller price. Sending the retail price here overbilled them, and
      // the server's tier fallback can't rescue it because price_pkr is always sent explicitly.
      const tier = tierPrice(p.price_pkr, p.reseller_price_pkr, custType);
      return [...prev, { key: p.id, product_id: p.id, name: p.name, sku: p.sku, brand: null, shipping_type: "sea", basePrice: tier, price: tier, qty: 1, discountPct: 0 }];
    });
    setProductQuery("");
  }

  async function save() {
    if (items.length === 0) return;
    try {
      // Lines first: if the RPC rejects (payment landed, invoice voided), the bank details
      // are left untouched too — no half-applied edit.
      await update.mutateAsync({
        id: invoice.id,
        // name/sku/brand matter for product-less (one-off) lines — the RPC rejects a line with
        // neither a product nor a name, and would otherwise lose the snapshot on re-insert.
        items: items.map((i) => ({
          product_id: i.product_id,
          qty: i.qty,
          price_pkr: i.basePrice,
          shipping_type: i.shipping_type,
          discount_pct: i.discountPct / 100,
          name: i.name,
          sku: i.sku,
          brand: i.brand,
        })),
      });
      await saveBank.mutateAsync(bank);
      toast.success("Invoice updated");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not update the invoice.");
    }
  }

  const pending = update.isPending || saveBank.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 4xl, not 2xl: the per-line discount added two columns and the rows no longer
          fit 2xl — they overflowed the dialog and the item name was clipped away. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit {invoice.invoice_no}</DialogTitle>
          <DialogDescription>
            Only an admin can edit an issued invoice, and only while it has no payments recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Add product</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Search by SKU or name…"
                className="pl-9"
              />
              {matches.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-card shadow-md">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary"
                    >
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{p.sku}</span>
                      <span className="flex-1 truncate text-sm">{p.name}</span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {p.price_pkr === null ? "—" : formatPKR(p.price_pkr)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No items. An invoice needs at least one.
              </p>
            ) : (
              <div className="divide-y divide-border overflow-x-auto">
                {items.map((i) => (
                  <div key={i.key} className="flex items-center gap-2 p-3">
                    <div className="min-w-[8rem] flex-1">
                      <p className="truncate text-sm font-medium">{i.name}</p>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{i.sku ?? "—"}</p>
                    </div>
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min={1}
                      value={i.qty}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.key === i.key
                              ? { ...x, qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) }
                              : x,
                          ),
                        )
                      }
                      className="w-14"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Select value={i.shipping_type} onValueChange={(v) => setItems((prev) => prev.map((x) => x.key === i.key ? { ...x, shipping_type: v as ShippingType } : x))}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sea">Sea</SelectItem>
                        <SelectItem value="air">Air</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label="Unit price"
                      type="number"
                      min={0}
                      value={i.price}
                      onChange={(e) => setPrice(i.key, Number(e.target.value))}
                      className="w-24"
                    />
                    <div className="relative w-20">
                      <Input
                        aria-label="Discount percent"
                        type="number"
                        min={0}
                        max={100}
                        value={i.discountPct ? +i.discountPct.toFixed(2) : ""}
                        placeholder="0"
                        onChange={(e) => setPct(i.key, Number(e.target.value))}
                        className="pr-6"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <span className="w-24 text-right text-sm tabular-nums text-[#cc0000]">
                      {i.discountPct > 0 ? `−${formatPKR(lineDiscountPkr(i.basePrice, i.qty, i.discountPct))}` : "—"}
                    </span>
                    <span className="w-24 text-right text-sm tabular-nums">
                      {formatPKR(i.basePrice * i.qty - lineDiscountPkr(i.basePrice, i.qty, i.discountPct))}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))}
                    >
                      <Trash2 className="size-4 text-[#cc0000]" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <dl className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatPKR(subtotal)}</dd>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="tabular-nums text-[#cc0000]">−{formatPKR(discount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1.5">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total (tax applied on save)
                </dt>
                <dd className="[font-family:var(--font-heading)] text-xl font-bold tabular-nums">
                  {formatPKR(subtotal - discount)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3 rounded-md border border-border p-4">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Bank details</Label>
              <p className="mt-1 text-xs text-amber-700">
                These are shared. Changing them updates the payment details on every invoice, not just this one.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Bank name</Label>
                <Input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Account title</Label>
                <Input
                  value={bank.account_title}
                  onChange={(e) => setBank({ ...bank, account_title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>IBAN</Label>
                <Input value={bank.iban} onChange={(e) => setBank({ ...bank, iban: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-[#cc0000] text-white hover:bg-[#a30000]"
            onClick={save}
            disabled={items.length === 0 || pending}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
