// Create / edit a one-off product (non-catalogue: name, OEM #, vendor, landed cost, sale price).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSaveOneoffProduct, type OneoffProduct } from "../../data/oneoffProducts";
import { useSuppliers } from "../../data/catalog";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";

export function OneoffProductDialog({ product, open, onOpenChange }: {
  product: OneoffProduct | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const save = useSaveOneoffProduct();
  const suppliersQ = useSuppliers();
  const [name, setName] = useState("");
  const [oem, setOem] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setOem(product?.oem_part_no ?? "");
    setSupplierId(product?.supplier_id ?? "");
    setCost(product ? String(product.landed_cost_pkr) : "");
    setPrice(product ? String(product.sale_price_pkr) : "");
  }, [open, product]);

  async function submit() {
    if (!name.trim()) return toast.error("Name the product");
    try {
      await save.mutateAsync({
        id: product?.id,
        input: {
          name: name.trim(), oem_part_no: oem.trim() || null, supplier_id: supplierId || null,
          landed_cost_pkr: Math.max(0, Number(cost) || 0), sale_price_pkr: Math.max(0, Number(price) || 0),
        },
      });
      toast.success(product ? "One-off product saved" : "One-off product added");
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit one-off product" : "New one-off product"}</DialogTitle>
          <DialogDescription>A non-catalogue item you can add to orders. Not stocked; records what you paid (landed) + the sale price.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. OEM Turbo Kit" /></div>
          <div className="space-y-2"><Label>OEM part #</Label><Input value={oem} onChange={(e) => setOem(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Vendor</Label>
            <Select value={supplierId || "none"} onValueChange={(v) => setSupplierId(v === "none" ? "" : v)}>
              <SelectTrigger aria-label="Vendor"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{(suppliersQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Landed cost (each)</Label><Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          <div className="space-y-2"><Label>Sale price (each)</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={submit} disabled={save.isPending || !name.trim()}>
            {save.isPending ? "Saving…" : product ? "Save changes" : "Add product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
