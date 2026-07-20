// Add / edit a vendor. One dialog for all three kinds: a PRODUCT vendor (the suppliers
// table — buy stock from, feeds product cost & purchasing) and the two LOGISTICS vendors
// (air-freight / sea-freight vendor_accounts you park prepaid credit with). Product vendors
// carry contact/country/currency; logistics vendors are just a name. Creating/editing a
// logistics vendor is admin-only (RLS), so those kinds only appear when `allowLogistics`.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useSaveSupplier, CURRENCY_CODES, type SupplierRow, type SupplierInput } from "../../data/crm";
import {
  useCreateVendorAccount,
  useUpdateVendorAccount,
  VENDOR_ROLE_LABEL,
} from "../../data/vendorAdvances";
import { displayCurrency } from "../../data/types";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { PhoneInput } from "../shared/PhoneInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@360/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";

export type VendorKind = "product" | "air_freight" | "sea_freight";

// What the caller passes to edit an existing vendor (null = create a new one).
export type VendorEditTarget =
  | { kind: "product"; supplier: SupplierRow }
  | {
      kind: "air_freight" | "sea_freight";
      id: string;
      name: string;
      contact: string | null;
      phone: string | null;
      country: string | null;
      currency: string;
    };

interface FormState {
  kind: VendorKind;
  name: string;
  contact: string;
  phone: string;
  country: string;
  currency: SupplierInput["currency"];
}

function initialForm(editing: VendorEditTarget | null): FormState {
  if (editing?.kind === "product") {
    const s = editing.supplier;
    return {
      kind: "product",
      name: s.name ?? "",
      contact: s.contact ?? "",
      phone: s.phone ?? "",
      country: s.country ?? "",
      currency: (s.currency as SupplierInput["currency"]) ?? "PKR",
    };
  }
  if (editing) {
    return {
      kind: editing.kind,
      name: editing.name,
      contact: editing.contact ?? "",
      phone: editing.phone ?? "",
      country: editing.country ?? "",
      currency: (editing.currency as SupplierInput["currency"]) ?? "PKR",
    };
  }
  return { kind: "product", name: "", contact: "", phone: "", country: "", currency: "PKR" };
}

export function VendorDialog({
  editing,
  allowLogistics,
  open,
  onOpenChange,
}: {
  editing: VendorEditTarget | null;
  allowLogistics: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const saveSupplier = useSaveSupplier();
  const createVendor = useCreateVendorAccount();
  const updateVendor = useUpdateVendorAccount();
  const [form, setForm] = useState<FormState>(initialForm(null));

  useEffect(() => {
    if (open) setForm(initialForm(editing));
  }, [editing, open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isProduct = form.kind === "product";
  const pending = saveSupplier.isPending || createVendor.isPending || updateVendor.isPending;

  async function onSubmit() {
    // Same field template for every vendor type; only the destination table differs.
    const fields = {
      name: form.name,
      contact: form.contact.trim() || null,
      phone: form.phone.trim() || null,
      country: form.country.trim() || null,
      currency: form.currency,
    };
    try {
      if (isProduct) {
        const input: SupplierInput = fields;
        await saveSupplier.mutateAsync({ id: editing?.kind === "product" ? editing.supplier.id : undefined, input });
      } else if (editing && editing.kind !== "product") {
        await updateVendor.mutateAsync({ id: editing.id, ...fields });
      } else {
        // Not product and not editing → form.kind is air/sea (the selector only offers those).
        await createVendor.mutateAsync({ ...fields, role: form.kind as "air_freight" | "sea_freight" });
      }
      toast.success(editing ? "Vendor updated" : "Vendor created");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not save vendor.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Vendor" : "New Vendor"}</DialogTitle>
          <DialogDescription>
            {isProduct
              ? "A product vendor you buy stock from, linked to product costs and purchasing."
              : "A logistics vendor you park prepaid air/sea freight credit with."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Vendor type</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => set("kind", v as VendorKind)}
              disabled={!!editing || !allowLogistics}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product</SelectItem>
                {allowLogistics && <SelectItem value="air_freight">{VENDOR_ROLE_LABEL.air_freight}</SelectItem>}
                {allowLogistics && <SelectItem value="sea_freight">{VENDOR_ROLE_LABEL.sea_freight}</SelectItem>}
              </SelectContent>
            </Select>
            {editing && <p className="text-xs text-muted-foreground">The vendor type can&apos;t be changed after creation.</p>}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Company</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Vendor name" />
          </div>

          <div className="space-y-2">
            <Label>Phone</Label>
            <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Preferred currency</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v as SupplierInput["currency"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCY_CODES.map((c) => <SelectItem key={c} value={c}>{displayCurrency(c)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={onSubmit} disabled={pending || !form.name.trim()}>
            {pending ? "Saving…" : editing ? "Save Changes" : "Create Vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
