import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { useProducts } from "../../data/catalog";
import { useOneoffProducts, type OneoffProduct } from "../../data/oneoffProducts";
import { useCustomerOrders, useOrderForInvoice } from "../../data/invoices";
import { OneoffProductDialog } from "../products/OneoffProductDialog";
import { formatPKR } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import { CustomerStep, selType, tierPrice, type CustomerSelection, type CustomerType } from "../shared/CustomerStep";
import type { CreateQuotationInput } from "../../data/quotations";
import type { ShippingType } from "../../data/invoices";

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function oiToDraft(oi: any, products: { id: string; name: string; sku: string; price_pkr: number | null; reseller_price_pkr: number | null }[]): DraftItem | null {
  if (!oi.product_id) {
    return { key: oi.oneoff_product_id ?? `oneoff-${oi.name}`, product_id: "", name: oi.name, sku: null, retail: null, reseller: null, shipping_type: "sea", price: oi.price_pkr ?? 0, qty: oi.qty, overridden: true, isOneoff: true };
  }
  const p = products.find((pp) => pp.id === oi.product_id);
  return p ? { key: p.id, product_id: p.id, name: p.name, sku: p.sku, retail: p.price_pkr, reseller: p.reseller_price_pkr, shipping_type: "sea", price: oi.price_pkr ?? p.price_pkr ?? 0, qty: oi.qty, overridden: true, isOneoff: false } : null;
}

export function QuotationFormDialog({ open, onOpenChange, initialOrderId, onCreate }: {
  open: boolean; onOpenChange: (o: boolean) => void; initialOrderId?: string | null; onCreate: (input: CreateQuotationInput) => Promise<void> | void;
}) {
  const productsQ = useProducts();
  const oneoffQ = useOneoffProducts();
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const [orderId, setOrderId] = useState<string>(NO_ORDER);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [oneoffQuery, setOneoffQuery] = useState("");
  const [oneoffDialogOpen, setOneoffDialogOpen] = useState(false);

  const customerId = customer?.kind === "existing" ? customer.id : null;
  const ordersQ = useCustomerOrders(customerId);
  const preOrderQ = useOrderForInvoice(open && initialOrderId ? initialOrderId : null);
  const appliedRef = useRef<string | null>(null);
  const prevCustomer = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setCustomer(null); setOrderId(NO_ORDER); setItems([]); setNotes(""); setProductQuery(""); setOneoffQuery("");
      appliedRef.current = null; prevCustomer.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (prevCustomer.current !== null && prevCustomer.current !== customerId) setOrderId(NO_ORDER);
    prevCustomer.current = customerId;
  }, [customerId]);

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
    setItems((o.order_items ?? []).map((oi) => oiToDraft(oi, products)).filter((x): x is DraftItem => x !== null));
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
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.qty, 0), [items]);
  const custType = selType(customer);
  const reseller = custType === "trade" || custType === "workshop";

  function addProduct(p: (typeof sellable)[number]) {
    setItems((prev) => {
      const found = prev.find((i) => i.key === p.id);
      if (found) return prev.map((i) => (i.key === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { key: p.id, product_id: p.id, name: p.name, sku: p.sku, retail: p.price_pkr, reseller: p.reseller_price_pkr, shipping_type: "sea", price: tierPrice(p.price_pkr, p.reseller_price_pkr, custType), qty: 1, overridden: false, isOneoff: false }];
    });
    setProductQuery("");
  }
  function addOneoff(op: OneoffProduct) {
    setItems((prev) => {
      const found = prev.find((i) => i.key === op.id);
      if (found) return prev.map((i) => (i.key === op.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { key: op.id, product_id: "", name: op.name, sku: op.oem_part_no, retail: null, reseller: null, shipping_type: "sea", price: op.sale_price_pkr, qty: 1, overridden: false, isOneoff: true }];
    });
    setOneoffQuery("");
  }
  function setQty(key: string, qty: number) { setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.floor(qty || 1)) } : i))); }
  function setPrice(key: string, price: number) { setItems((prev) => prev.map((i) => (i.key === key ? { ...i, price: Math.max(0, price || 0), overridden: true } : i))); }

  useEffect(() => {
    setItems((prev) => prev.map((i) => (i.overridden || i.isOneoff ? i : { ...i, price: tierPrice(i.retail, i.reseller, custType) })));
  }, [custType]);

  function linkOrder(id: string) {
    setOrderId(id);
    if (id === NO_ORDER) return;
    const order = (ordersQ.data ?? []).find((o) => o.id === id);
    if (!order) return;
    const products = productsQ.data ?? [];
    setItems((order.order_items ?? []).map((oi) => oiToDraft(oi, products)).filter((x): x is DraftItem => x !== null));
  }

  async function save() {
    if (!customer || items.length === 0) return;
    try {
      const customerSnapshot =
        customer.kind === "existing"
          ? { source: "existing" as const, id: customer.id, name: customer.label, type: customer.type, email: null, phone: null, city: null }
          : { source: "new" as const, id: null, name: customer.draft.name.trim(), type: customer.draft.type, email: customer.draft.email || null, phone: customer.draft.phone || null, city: customer.draft.city || null };
      await onCreate({
        customer: customerSnapshot,
        order_id: orderId === NO_ORDER ? null : orderId,
        order_no: (ordersQ.data ?? []).find((o) => o.id === orderId)?.order_no ?? null,
        items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, price_pkr: i.price, name: i.name, sku: i.sku, shipping_type: i.shipping_type })),
        notes: notes.trim(),
      });
      toast.success("Quotation created");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not create quotation.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Quotation</DialogTitle>
          <DialogDescription>Build a customer quote from catalogue and/or one-off products.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <CustomerStep value={customer} onChange={setCustomer} />

          {customerId && (ordersQ.data?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>Link order <span className="text-muted-foreground">(optional, prefills items)</span></Label>
              <Select value={orderId} onValueChange={linkOrder}>
                <SelectTrigger><SelectValue placeholder="No linked order" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ORDER}>No linked order</SelectItem>
                  {(ordersQ.data ?? []).map((o) => (<SelectItem key={o.id} value={o.id}>{o.order_no}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}

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

          <div className="space-y-2">
            <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Quote validity, delivery notes, special terms…" />
          </div>

          <div className="rounded-md border border-border">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No items yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {items.map((i) => (
                  <div key={i.key} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
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
                    <span className="w-24 text-right text-sm tabular-nums">{formatPKR(i.price * i.qty)}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))}>
                      <Trash2 className="size-4 text-[#cc0000]" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-end justify-between gap-4 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Saved to your account, printable and reusable across devices.</p>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="[font-family:var(--font-heading)] text-xl font-bold tabular-nums">{formatPKR(subtotal)}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={save} disabled={!customer || items.length === 0}>
            Create Quotation
          </Button>
        </DialogFooter>
      </DialogContent>
      <OneoffProductDialog product={null} open={oneoffDialogOpen} onOpenChange={setOneoffDialogOpen} />
    </Dialog>
  );
}
