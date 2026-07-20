// Add / edit a customer record (Supabase + zod).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useSaveCustomer, type Customer, type CustomerInput } from "../../data/crm";
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

const TYPES: { value: CustomerInput["type"]; label: string }[] = [
  { value: "retail", label: "Retail" },
  { value: "trade", label: "Trade" },
  { value: "workshop", label: "Workshop" },
];

interface FormState {
  name: string;
  email: string;
  phone: string;
  city: string;
  type: CustomerInput["type"];
  address: string;
  province: string;
  postal_code: string;
}

function fromCustomer(c: Customer | null): FormState {
  return {
    name: c?.name ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    city: c?.city ?? "",
    type: c?.type ?? "retail",
    address: c?.address ?? "",
    province: c?.province ?? "",
    postal_code: c?.postal_code ?? "",
  };
}

export function CustomerDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const save = useSaveCustomer();
  const [form, setForm] = useState<FormState>(fromCustomer(null));

  useEffect(() => {
    if (open) setForm(fromCustomer(customer));
  }, [customer, open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit() {
    const input: CustomerInput = {
      name: form.name,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      type: form.type,
      address: form.address.trim() || null,
      province: form.province.trim() || null,
      postal_code: form.postal_code.trim() || null,
    };
    try {
      await save.mutateAsync({ id: customer?.id, input });
      toast.success(customer ? "Customer updated" : "Customer created");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not save customer.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "New Customer"}</DialogTitle>
          <DialogDescription>Customer profile details.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name or business" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v as CustomerInput["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Province</Label>
            <Input value={form.province} onChange={(e) => set("province", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Postal code</Label>
            <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={onSubmit} disabled={save.isPending || !form.name}>
            {save.isPending ? "Saving…" : customer ? "Save Changes" : "Create Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
