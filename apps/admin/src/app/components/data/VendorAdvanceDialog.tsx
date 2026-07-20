// Record a vendor advance movement — a top-up (money sent / credit added) or a
// draw-down (credit consumed). Amounts are in PKR.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useRecordAdvance, type VendorBalance } from "../../data/vendorAdvances";
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

export function VendorAdvanceDialog({
  open,
  onOpenChange,
  vendors,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendors: VendorBalance[];
}) {
  const record = useRecordAdvance();
  // Keep the main picker clean: the logistics vendors listed individually + a single "Product vendor"
  // entry that reveals a second dropdown of the (many) product vendors.
  const logistics = vendors.filter((v) => v.role != null);
  const products = vendors.filter((v) => v.supplier_id != null);
  const [category, setCategory] = useState(""); // a logistics vendor_account_id, or "product"
  const [productVendorId, setProductVendorId] = useState("");
  const [kind, setKind] = useState<"topup" | "drawdown">("topup");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [note, setNote] = useState("");

  const isProduct = category === "product";
  const vendorId = isProduct ? productVendorId : category;
  // A negative or non-numeric amount is caught here rather than by the zod parse inside the
  // mutation, so the operator is told at the field instead of via an error toast on submit.
  const amountNum = Number(amount);
  const amountError =
    amount.trim() === "" ? null : !Number.isFinite(amountNum) ? "Enter a valid amount." : amountNum <= 0 ? "Amount must be more than 0." : null;

  useEffect(() => {
    if (open) {
      setCategory(vendors.find((v) => v.role != null)?.vendor_account_id ?? "product");
      setProductVendorId("");
      setKind("topup");
      setAmount("");
      setOccurredOn("");
      setNote("");
    }
  }, [open, vendors]);

  async function onSubmit() {
    try {
      await record.mutateAsync({
        vendor_account_id: vendorId,
        kind,
        amount_pkr: Number(amount),
        occurred_on: occurredOn || undefined,
        note: note.trim() || null,
      });
      toast.success(kind === "topup" ? "Payment recorded" : "Draw-down recorded");
      onOpenChange(false);
    } catch (e) {
      // A ZodError's .message is the raw issue JSON — surface the first issue's text instead,
      // matching every other form in the app.
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not record");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make vendor payment</DialogTitle>
          <DialogDescription>
            Amounts are in PKR. A payment sends money to the vendor and adds prepaid credit; a draw-down consumes
            credit you already hold.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Vendor</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v); if (v !== "product") setProductVendorId(""); }}>
              <SelectTrigger><SelectValue placeholder="Choose a vendor" /></SelectTrigger>
              <SelectContent>
                {logistics.map((v) => (
                  <SelectItem key={v.vendor_account_id} value={v.vendor_account_id}>{v.name}</SelectItem>
                ))}
                <SelectItem value="product">Product vendor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isProduct && (
            <div className="space-y-2">
              <Label>Product vendor</Label>
              <Select value={productVendorId} onValueChange={setProductVendorId}>
                <SelectTrigger><SelectValue placeholder="Choose a product vendor" /></SelectTrigger>
                <SelectContent>
                  {products.map((v) => (
                    <SelectItem key={v.vendor_account_id} value={v.vendor_account_id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {products.length === 0 && <p className="text-xs text-muted-foreground">No product vendors yet. Add one in Data Management.</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "topup" | "drawdown")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="topup">Payment (money sent / credit added)</SelectItem>
                <SelectItem value="drawdown">Draw-down (credit consumed)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="advance-amount">Amount (PKR)</Label>
              <Input
                id="advance-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-invalid={!!amountError}
                aria-describedby={amountError ? "advance-amount-error" : undefined}
                className={amountError ? "border-[#cc0000] focus-visible:ring-[#cc0000]/40" : undefined}
              />
              {amountError && <p id="advance-amount-error" className="text-xs font-medium text-[#cc0000]">{amountError}</p>}
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Note <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. wire reference, order, reason" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-[#cc0000] text-white hover:bg-[#a30000]"
            onClick={onSubmit}
            disabled={record.isPending || !vendorId || !amount || !!amountError}
          >
            {record.isPending ? "Saving…" : kind === "topup" ? "Make payment" : "Record draw-down"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
