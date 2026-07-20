// Create an invoice: customer (existing or deferred new), optional linked order (prefills items),
// catalogue line items and/or one-off products. Saved atomically via the create_invoice RPC.
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useProducts } from "../../data/catalog";
import { useOneoffProducts, type OneoffProduct } from "../../data/oneoffProducts";
import { useCreateInvoice, useOrderForInvoice, lineDiscountPkr, pctFromPrice, priceFromPct, type CreateInvoiceInput } from "../../data/invoices";
import { OneoffProductDialog } from "../products/OneoffProductDialog";
import { CustomerStep, selType, tierPrice, type CustomerSelection, type CustomerType } from "../shared/CustomerStep";
import type { ShippingType } from "../../data/invoices";
import { formatPKR } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";

const NO_ORDER = "none";

interface DraftItem {
  key: string;
  product_id: string;   // "" for a one-off line
  name: string;
  sku: string | null;
  retail: number | null;
  reseller: number | null;
  shipping_type: ShippingType;
  price: number;
  qty: number;
  overridden: boolean;
  isOneoff: boolean;
  // LIST price (stored as price_pkr). Editing the price box back-solves discountPct off this
  // rather than lowering it, so a reduction always shows up as a discount.
  basePrice: number;
  // Whole percent as typed (10 = 10% off). Converted to the fraction the RPC wants on save.
  discountPct: number;
}

export function InvoiceFormDialog({ open, onOpenChange, initialOrderId }: { open: boolean; onOpenChange: (o: boolean) => void; initialOrderId?: string | null }) {
  const productsQ = useProducts();
  const oneoffQ = useOneoffProducts();
  const create = useCreateInvoice();
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const [orderId, setOrderId] = useState<string>(NO_ORDER);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [oneoffQuery, setOneoffQuery] = useState("");
  const [oneoffDialogOpen, setOneoffDialogOpen] = useState(false);

  const customerId = customer?.kind === "existing" ? customer.id : null;
  const preOrderQ = useOrderForInvoice(open && initialOrderId ? initialOrderId : null);
  const appliedRef = useRef<string | null>(null);
  const prevCustomer = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setCustomer(null); setOrderId(NO_ORDER); setItems([]); setProductQuery(""); setOneoffQuery("");
      appliedRef.current = null; prevCustomer.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (prevCustomer.current !== null && prevCustomer.current !== customerId) setOrderId(NO_ORDER);
    prevCustomer.current = customerId;
  }, [customerId]);

  // Prefill from ?order — copy its items (catalogue + one-off), once, when loaded.
  useEffect(() => {
    if (!open || !initialOrderId || appliedRef.current === initialOrderId) return;
    const o = preOrderQ.data;
    const products = productsQ.data;
    if (!o || !o.customers || !products) return;
    appliedRef.current = initialOrderId;
    const c = o.customers as { id: string; name: string; type: CustomerType; phone: string | null; email: string | null; city: string | null };
    setCustomer({ kind: "existing", id: c.id, type: c.type, label: c.name, sub: c.phone || c.email || c.city || "" });
    prevCustomer.current = c.id;
    setOrderId(o.id);
    setItems(
      (o.order_items ?? []).map((oi): DraftItem | null => {
        if (!oi.product_id) {
          return { key: oi.oneoff_product_id ?? `oneoff-${oi.name}`, product_id: "", name: oi.name, sku: null, retail: null, reseller: null, shipping_type: "sea", price: oi.price_pkr ?? 0, qty: oi.qty, overridden: true, isOneoff: true, discountPct: 0, basePrice: oi.price_pkr ?? 0 };
        }
        const p = products.find((pp) => pp.id === oi.product_id);
        return p ? { key: p.id, product_id: p.id, name: p.name, sku: p.sku, retail: p.price_pkr, reseller: p.reseller_price_pkr, shipping_type: "sea", price: oi.price_pkr ?? p.price_pkr ?? 0, qty: oi.qty, overridden: true, isOneoff: false, discountPct: 0, basePrice: oi.price_pkr ?? p.price_pkr ?? 0 } : null;
      }).filter((x): x is DraftItem => x !== null),
    );
  }, [open, initialOrderId, preOrderQ.data, productsQ.data]);

  const sellable = useMemo(() => (productsQ.data ?? []).filter((p) => p.visibility === "visible"), [productsQ.data]);
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
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.basePrice * i.qty, 0), [items]);
  const discount = useMemo(() => items.reduce((s, i) => s + lineDiscountPkr(i.basePrice, i.qty, i.discountPct), 0), [items]);
  const custType = selType(customer);
  const reseller = custType === "trade" || custType === "workshop";

  function addProduct(p: (typeof sellable)[number]) {
    setItems((prev) => {
      const found = prev.find((i) => i.key === p.id);
      if (found) return prev.map((i) => (i.key === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { key: p.id, product_id: p.id, name: p.name, sku: p.sku, retail: p.price_pkr, reseller: p.reseller_price_pkr, shipping_type: "sea", price: tierPrice(p.price_pkr, p.reseller_price_pkr, custType), qty: 1, overridden: false, isOneoff: false, discountPct: 0, basePrice: tierPrice(p.price_pkr, p.reseller_price_pkr, custType) }];
    });
    setProductQuery("");
  }
  function addOneoff(op: OneoffProduct) {
    setItems((prev) => {
      const found = prev.find((i) => i.key === op.id);
      if (found) return prev.map((i) => (i.key === op.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { key: op.id, product_id: "", name: op.name, sku: op.oem_part_no, retail: null, reseller: null, shipping_type: "sea", price: op.sale_price_pkr, qty: 1, overridden: false, isOneoff: true, discountPct: 0, basePrice: op.sale_price_pkr }];
    });
    setOneoffQuery("");
  }
  function setQty(key: string, qty: number) { setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.floor(qty || 1)) } : i))); }
  // Typing an agreed price back-solves the discount percentage; typing a percentage recomputes
  // the price. Above the list price it isn't a discount — that's simply a new list price.
  function setPrice(key: string, price: number) {
    setItems((prev) => prev.map((i) => {
      if (i.key !== key) return i;
      const v = Math.max(0, price || 0);
      if (v >= i.basePrice) return { ...i, basePrice: v, price: v, discountPct: 0, overridden: true };
      return { ...i, price: v, discountPct: pctFromPrice(i.basePrice, v), overridden: true };
    }));
  }
  function setPct(key: string, next: number) {
    setItems((prev) => prev.map((i) => {
      if (i.key !== key) return i;
      const pct = Math.min(100, Math.max(0, next || 0));
      return { ...i, discountPct: pct, price: priceFromPct(i.basePrice, pct) };
    }));
  }

  useEffect(() => {
    setItems((prev) => prev.map((i) => (i.overridden || i.isOneoff ? i : { ...i, basePrice: tierPrice(i.retail, i.reseller, custType), price: priceFromPct(tierPrice(i.retail, i.reseller, custType), i.discountPct) })));
  }, [custType]);

  async function save() {
    if (!customer || items.length === 0) return;
    const input: CreateInvoiceInput = {
      customer_id: customer.kind === "existing" ? customer.id : null,
      new_customer: customer.kind === "new" ? customer.draft : null,
      order_id: orderId === NO_ORDER ? null : orderId,
      items: items.map((i) => i.isOneoff
        ? { product_id: "", name: i.name, qty: i.qty, price_pkr: i.basePrice, shipping_type: i.shipping_type, discount_pct: i.discountPct / 100 }
        : { product_id: i.product_id, qty: i.qty, price_pkr: i.basePrice, shipping_type: i.shipping_type, discount_pct: i.discountPct / 100 }),
      due_date: null,
    };
    try {
      await create.mutateAsync(input);
      toast.success("Invoice created");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not create invoice.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 4xl, not 2xl: the per-line discount added two columns and the rows no longer
          fit 2xl — they overflowed the dialog and the item name was clipped away. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
          <DialogDescription>Choose or add a customer, then add catalogue and/or one-off products.</DialogDescription>
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
              <div className="divide-y divide-border overflow-x-auto">
                {items.map((i) => (
                  <div key={i.key} className="flex items-center gap-2 p-3">
                    <div className="min-w-[8rem] flex-1">
                      <p className="truncate text-sm font-medium">{i.name}{i.isOneoff && <span className="ml-2 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">One-off</span>}</p>
                      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{i.sku ?? "—"}{i.overridden && <span className="ml-2 text-amber-600">custom price</span>}</p>
                    </div>
                    <Input aria-label="Quantity" type="number" min={1} value={i.qty} onChange={(e) => setQty(i.key, Number(e.target.value))} className="w-14" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Select value={i.shipping_type} onValueChange={(v) => setItems((prev) => prev.map((x) => x.key === i.key ? { ...x, shipping_type: v as ShippingType } : x))}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sea">Sea</SelectItem>
                        <SelectItem value="air">Air</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input aria-label="Unit price" type="number" min={0} value={i.price} onChange={(e) => setPrice(i.key, Number(e.target.value))} className="w-24" />
                    <div className="relative w-20">
                      <Input aria-label="Discount percent" type="number" min={0} max={100} value={i.discountPct ? +i.discountPct.toFixed(2) : ""} placeholder="0"
                        onChange={(e) => setPct(i.key, Number(e.target.value))}
                        className="pr-6" />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <span className="w-24 text-right text-sm tabular-nums text-[#cc0000]">{i.discountPct > 0 ? `−${formatPKR(lineDiscountPkr(i.basePrice, i.qty, i.discountPct))}` : "—"}</span>
                    <span className="w-24 text-right text-sm tabular-nums">{formatPKR(i.basePrice * i.qty - lineDiscountPkr(i.basePrice, i.qty, i.discountPct))}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))}>
                      <Trash2 className="size-4 text-[#cc0000]" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-end justify-between gap-4 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Payment terms: <span className="font-medium text-foreground">100% advance</span></p>
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
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Total (tax applied on save)</dt>
                <dd className="[font-family:var(--font-heading)] text-xl font-bold tabular-nums">{formatPKR(subtotal - discount)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={save} disabled={!customer || items.length === 0 || create.isPending}>
            {create.isPending ? "Creating…" : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <OneoffProductDialog product={null} open={oneoffDialogOpen} onOpenChange={setOneoffDialogOpen} />
    </Dialog>
  );
}
