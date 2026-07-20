// Create / edit a planned purchase — a wishlist item (no vendor yet, so not a PO), shown as a
// card in the board's Planning lane until it graduates.
// Extracted from the old Pipeline page so the board owns the full lifecycle without a separate
// tab. Adds a Delete affordance (was a row action on the retired table) gated on can("delete").
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useCreatePlanned,
  useUpdatePlanned,
  useDeletePlanned,
  PRIORITY_LABEL,
  STATUS_LABEL,
  SETTABLE_STATUS,
  type PlannedPurchase,
  type PlanPriority,
  type PlanStatus,
} from "../../data/pipeline";
import { useSuppliers, useProducts } from "../../data/catalog";
import { useAuth } from "../../data/auth";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Textarea } from "@360/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import { Trash2 } from "lucide-react";

// `prefill` seeds a brand-new plan (ignored when editing) — used by the "Restock in Purchasing"
// jump from an out-of-stock order line, which lands here with the product + shortfall qty ready.
export interface PlannedPrefill { item_name?: string; product_id?: string | null; planned_qty?: number | null }

export function PlannedDialog({ open, onOpenChange, editing, prefill }: { open: boolean; onOpenChange: (o: boolean) => void; editing: PlannedPurchase | null; prefill?: PlannedPrefill | null }) {
  const create = useCreatePlanned();
  const update = useUpdatePlanned();
  const del = useDeletePlanned();
  const { can } = useAuth();
  const suppliersQ = useSuppliers();
  const productsQ = useProducts();

  const [itemName, setItemName] = useState("");
  const [productId, setProductId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [qty, setQty] = useState("");
  const [estCost, setEstCost] = useState("");
  const [priority, setPriority] = useState<PlanPriority>("medium");
  const [status, setStatus] = useState<PlanStatus>("researching");
  const [notes, setNotes] = useState("");

  const suppliers = suppliersQ.data ?? [];
  const products = productsQ.data ?? [];

  // hydrate from `editing` when editing, else from `prefill` (a restock jump) or blank for a new plan
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setItemName(editing.item_name ?? "");
      setProductId(editing.product_id ?? "");
      setSupplierId(editing.supplier_id ?? "");
      setQty(editing.planned_qty != null ? String(editing.planned_qty) : "");
      setEstCost(editing.est_unit_cost_pkr != null ? String(editing.est_unit_cost_pkr) : "");
      setPriority(editing.priority ?? "medium");
      setStatus((editing.status !== "ordered" ? editing.status : "researching") as PlanStatus);
      setNotes(editing.notes ?? "");
    } else {
      setItemName(prefill?.item_name ?? "");
      setProductId(prefill?.product_id ?? "");
      setSupplierId("");
      setQty(prefill?.planned_qty != null ? String(prefill.planned_qty) : "");
      setEstCost("");
      setPriority("medium");
      setStatus("researching");
      setNotes("");
    }
  }, [open, editing, prefill]);

  async function submit() {
    if (!itemName.trim()) return toast.error("What are you planning to buy?");
    const payload = {
      item_name: itemName.trim(),
      product_id: productId || null,
      supplier_id: supplierId || null,
      planned_qty: qty.trim() ? Math.floor(Number(qty)) : null,
      est_unit_cost_pkr: estCost.trim() ? Number(estCost) : null,
      target_retail_pkr: null,
      priority,
      status: status as Exclude<PlanStatus, "ordered">,
      notes: notes.trim() || null,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(editing ? "Updated" : "Added to the plan");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function doDelete() {
    if (!editing) return;
    if (!confirm(`Remove "${editing.item_name}" from the plan?`)) return;
    try {
      await del.mutateAsync(editing.id);
      toast.success("Removed");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  }

  const canDelete = !!editing && editing.status !== "ordered" && can("delete");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit planned purchase" : "New planned purchase"}</DialogTitle>
          <DialogDescription>Track something you want to source. Link a catalogue product + vendor when ready to turn it into a PO.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Item</Label>
            <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. NGK Spark Plugs — Civic 11th 1.5T" />
          </div>
          <div className="space-y-2">
            <Label>Catalogue product <span className="text-muted-foreground">(optional)</span></Label>
            <Select value={productId || "none"} onValueChange={(v) => setProductId(v === "none" ? "" : v)}>
              <SelectTrigger aria-label="Catalogue product"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not yet a product</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Vendor <span className="text-muted-foreground">(optional)</span></Label>
            <Select value={supplierId || "none"} onValueChange={(v) => setSupplierId(v === "none" ? "" : v)}>
              <SelectTrigger aria-label="Vendor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Undecided</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Planned qty</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="space-y-2"><Label>Est. unit cost (PKR)</Label><Input type="number" min={0} value={estCost} onChange={(e) => setEstCost(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as PlanPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["high", "medium", "low"] as PlanPriority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PlanStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SETTABLE_STATUS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Quotes, contacts, why…" /></div>
        </div>
        <DialogFooter className="sm:justify-between">
          {canDelete ? (
            <Button variant="ghost" className="text-[#cc0000] hover:bg-[#cc0000]/10 hover:text-[#cc0000]" onClick={doDelete} disabled={del.isPending}>
              <Trash2 className="size-4" /> Remove
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={create.isPending || update.isPending || !itemName.trim()}>
              {create.isPending || update.isPending ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
