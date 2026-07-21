// Operating-expenses ledger — record/edit expenses with an optional receipt attachment.
// Feeds analytics_daily.expense_pkr (Money out) and pnl_summary (profit). Lives in Finance.
import { useState } from "react";
import { useOpenOnNewParam } from "../../lib/useOpenOnNewParam";
import { Paperclip, Pencil, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { ExpenseDialog } from "./ExpenseDialog";
import { useExpenses, useDeleteExpense, EXPENSE_LABEL, type ExpenseRow } from "../../data/expenses";
import { receiptUrl } from "../../data/storage";
import { useAuth } from "../../data/auth";
import { formatPKR, formatDate } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@360/ui/table";
import { useTableSort, SortHead } from "../common/useTableSort";
import { useConfirm } from "../common/confirm";

// Opens a private receipt via a short-lived signed URL (fetched on click).
function ReceiptCell({ path }: { path: string | null }) {
  if (!path) return <span className="text-muted-foreground">—</span>;
  async function open() {
    const url = await receiptUrl(path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Could not open the receipt");
  }
  return (
    <button className="inline-flex items-center gap-1 text-sm text-[#cc0000] hover:underline" onClick={open}>
      <Paperclip className="size-3.5" /> View
    </button>
  );
}

export function ExpensesManager() {
  const expensesQ = useExpenses();
  const delExpense = useDeleteExpense();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [expEdit, setExpEdit] = useState<ExpenseRow | null>(null);
  const [expDialog, setExpDialog] = useState(false);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rows = (expensesQ.data ?? []).filter((e) => !term || (EXPENSE_LABEL[e.category] ?? "").toLowerCase().includes(term) || (e.suppliers?.name ?? "").toLowerCase().includes(term) || (e.note ?? "").toLowerCase().includes(term));
  const sort = useTableSort(rows, {
    date: (e) => e.spent_on,
    category: (e) => EXPENSE_LABEL[e.category],
    supplier: (e) => e.suppliers?.name ?? null,
    note: (e) => e.note,
    amount: (e) => e.amount_pkr,
  }, "date", "desc");

  function openNew() { setExpEdit(null); setExpDialog(true); }
  useOpenOnNewParam(openNew); // topbar "+ New → Record expense"
  function openEdit(e: ExpenseRow) { setExpEdit(e); setExpDialog(true); }
  async function remove(e: ExpenseRow) {
    if (!(await confirm({ title: "Delete this expense?", destructive: true }))) return;
    try {
      await delExpense.mutateAsync(e.id);
      toast.success("Expense deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by category, vendor, or note…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        {can("edit") && (
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={openNew}>
            <Plus className="size-4" /> Record Expense
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <SortHead label="Date" sortKey="date" sort={sort} className="text-white" />
              <SortHead label="Category" sortKey="category" sort={sort} className="text-white" />
              <SortHead label="Supplier" sortKey="supplier" sort={sort} className="text-white" />
              <SortHead label="Note" sortKey="note" sort={sort} className="text-white" />
              <SortHead label="Amount" sortKey="amount" sort={sort} className="text-white" />
              <TableHead className="text-white">Receipt</TableHead>
              <TableHead className="text-white w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sort.sorted.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(e.spent_on)}</TableCell>
                <TableCell>{EXPENSE_LABEL[e.category]}</TableCell>
                <TableCell className="text-muted-foreground">{e.suppliers?.name ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">{e.note}</TableCell>
                <TableCell className="tabular-nums">{formatPKR(e.amount_pkr)}</TableCell>
                <TableCell><ReceiptCell path={e.receipt_path} /></TableCell>
                <TableCell>
                  {can("edit") && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(e)}><Pencil className="size-4" /></Button>
                      {can("delete") && <Button variant="ghost" size="icon" className="size-8" onClick={() => remove(e)}><Trash2 className="size-4 text-[#cc0000]" /></Button>}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {expensesQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
        {!expensesQ.isLoading && expensesQ.data?.length === 0 && <p className="p-6 text-center text-muted-foreground">No expenses yet.</p>}
      </div>

      <ExpenseDialog expense={expEdit} open={expDialog} onOpenChange={setExpDialog} />
    </div>
  );
}
