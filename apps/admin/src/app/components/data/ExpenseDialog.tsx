// Add / edit an expense (Supabase + zod). Optional supplier link; feeds Money Out.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import {
  useSaveExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_LABEL,
  type ExpenseRow,
  type ExpenseInput,
} from "../../data/expenses";
import { uploadReceipt, receiptUrl, removeReceipt, validateReceiptFile } from "../../data/storage";
import { useSuppliers } from "../../data/catalog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";

const NO_SUPPLIER = "none";

type OpexCategory = (typeof EXPENSE_CATEGORIES)[number];

interface FormState {
  category: OpexCategory;
  amount: string;
  spent_on: string;
  note: string;
  supplier_id: string;
  receipt_path: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function fromExpense(e: ExpenseRow | null): FormState {
  return {
    category: e && (EXPENSE_CATEGORIES as readonly string[]).includes(e.category) ? (e.category as OpexCategory) : "operations",
    amount: e ? String(e.amount_pkr) : "",
    spent_on: e?.spent_on ?? today(),
    note: e?.note ?? "",
    supplier_id: e?.supplier_id ?? NO_SUPPLIER,
    receipt_path: e?.receipt_path ?? "",
  };
}

export function ExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: ExpenseRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const save = useSaveExpense();
  const suppliersQ = useSuppliers();
  const [form, setForm] = useState<FormState>(fromExpense(null));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // A legacy inventory/shipping/marketing row can't be saved as-is (opex-only CHECK) — flag that
  // editing it reclassifies it, so it's a deliberate choice, never a silent P&L change.
  const legacyCategory = expense && !(EXPENSE_CATEGORIES as readonly string[]).includes(expense.category) ? expense.category : null;

  useEffect(() => {
    if (open) setForm(fromExpense(expense));
  }, [expense, open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const savedReceipt = expense?.receipt_path ?? ""; // the path already persisted on this row

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    const err = validateReceiptFile(file);
    if (err) return toast.error(err);
    setUploading(true);
    try {
      const path = await uploadReceipt(file);
      // Clean up a just-uploaded-but-not-yet-saved orphan we're replacing (never the saved one).
      if (form.receipt_path && form.receipt_path !== savedReceipt) await removeReceipt(form.receipt_path);
      set("receipt_path", path);
      toast.success("Receipt attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the receipt.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onViewReceipt() {
    const url = await receiptUrl(form.receipt_path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Could not open the receipt.");
  }

  async function onRemoveReceipt() {
    if (form.receipt_path && form.receipt_path !== savedReceipt) await removeReceipt(form.receipt_path); // drop the orphan
    set("receipt_path", "");
  }

  // Dismissing the dialog abandons the form, so anything uploaded during this session and not
  // yet persisted is an orphan — the replace/remove/save paths already clean up, this closes
  // the last hole (Cancel / Esc / click-away).
  async function onDismiss() {
    const pending = form.receipt_path;
    onOpenChange(false);
    if (pending && pending !== savedReceipt) {
      try {
        await removeReceipt(pending);
      } catch {
        /* best-effort cleanup — the dialog is already closed, don't surface a toast */
      }
    }
  }

  async function onSubmit() {
    const input: ExpenseInput = {
      category: form.category,
      amount_pkr: form.amount.trim() === "" ? NaN : Number(form.amount),
      spent_on: form.spent_on,
      note: form.note.trim() || null,
      supplier_id: form.supplier_id === NO_SUPPLIER ? null : form.supplier_id,
      receipt_path: form.receipt_path || null,
    };
    try {
      await save.mutateAsync({ id: expense?.id, input });
      // On success, if the saved receipt was replaced/removed, delete the old object.
      if (savedReceipt && savedReceipt !== form.receipt_path) await removeReceipt(savedReceipt);
      toast.success(expense ? "Expense updated" : "Expense recorded");
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) toast.error(e.issues[0]?.message ?? "Please check the form.");
      else toast.error(e instanceof Error ? e.message : "Could not save expense.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : void onDismiss())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Expense" : "Record Expense"}</DialogTitle>
          <DialogDescription>Operating expenses only (rent, salaries, subscriptions…). Reduces &quot;What you kept&quot;. Inventory &amp; shipping are COGS, tracked via purchasing, not here.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v as OpexCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{EXPENSE_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
            {legacyCategory && (
              <p className="text-xs text-amber-600">
                Was logged as &quot;{EXPENSE_LABEL[legacyCategory]}&quot; (a legacy category). Saving reclassifies it as {EXPENSE_LABEL[form.category]}.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Amount (PKR)</Label>
            <Input type="number" min={0} value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={form.spent_on} onChange={(e) => set("spent_on", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Supplier <span className="text-muted-foreground">(optional)</span></Label>
            <Select value={form.supplier_id} onValueChange={(v) => set("supplier_id", v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUPPLIER}>None</SelectItem>
                {(suppliersQ.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Note <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Receipt <span className="text-muted-foreground">(optional · image or PDF)</span></Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            {form.receipt_path ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
                <FileText className="size-4 text-muted-foreground" />
                <button type="button" className="text-sm text-[#cc0000] hover:underline" onClick={onViewReceipt}>View receipt</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => fileRef.current?.click()} disabled={uploading}>Replace</button>
                <Button type="button" variant="ghost" size="icon" className="ml-auto size-7" onClick={onRemoveReceipt} aria-label="Remove receipt"><X className="size-4" /></Button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                {uploading ? "Uploading…" : "Attach receipt"}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => void onDismiss()}>Cancel</Button>
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={onSubmit} disabled={save.isPending || uploading || !form.amount.trim()}>
            {save.isPending ? "Saving…" : expense ? "Save Changes" : "Record Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
