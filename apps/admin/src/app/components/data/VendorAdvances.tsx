// Vendor Advances tab — working-capital prepaid credit with the 3 logistics vendors,
// all paid in PKR. A "Capital parked with vendors" summary (PKR balance, tracked directly)
// + the immutable top-up/draw-down ledger. Deliberately kept separate from the P&L cards —
// this is a balance-sheet figure, not revenue/profit.
import { useState } from "react";
import { ChevronDown, Plus, Wallet } from "lucide-react";
import { useVendorBalances, useVendorLedger, vendorTag } from "../../data/vendorAdvances";
import { useAuth } from "../../data/auth";
import { VendorAdvanceDialog } from "./VendorAdvanceDialog";
import { formatPKR, formatDate } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@360/ui/table";
import { useTableSort, SortHead } from "../common/useTableSort";

export function VendorAdvances() {
  const balancesQ = useVendorBalances();
  const ledgerQ = useVendorLedger();
  const { can } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  // Collapsible. The header — including the total and the "not revenue / profit" guardrail —
  // stays visible when collapsed; only the per-vendor split folds away. Collapsing must never
  // hide the caveat that this is prepaid credit, or the figure starts reading like profit.
  const [open, setOpen] = useState(true);

  // Only vendors that actually have parked credit (positive balance) — a zero/overdrawn
  // vendor isn't "capital parked", so it's left out of the summary.
  const parked = (balancesQ.data ?? []).filter((b) => b.balance_pkr > 0);
  const totalPkr = parked.reduce((s, b) => s + b.balance_pkr, 0);

  const ledger = ledgerQ.data ?? [];
  const sort = useTableSort(ledger, {
    date: (e) => e.occurred_on,
    vendor: (e) => e.vendor_accounts?.name ?? null,
    type: (e) => (e.reverses_id ? "Reversal" : e.kind === "topup" ? "Top-up" : "Draw-down"),
    amount: (e) => (e.kind === "topup" ? e.amount_pkr : -e.amount_pkr),
    note: (e) => e.note,
  }, "date", "desc");

  return (
    <div className="space-y-4">
      {/* Summary — balance-sheet figure, kept separate from the P&L cards */}
      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            "flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
            open && "border-b border-border",
          )}
        >
          <span className="flex items-center gap-2">
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
            <Wallet className="size-4 text-[#cc0000]" />
            <span className="font-heading uppercase tracking-wide">Capital parked with vendors</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">prepaid credit · not revenue / profit</span>
          </span>
          <span className="font-heading text-lg font-bold tabular-nums">
            {formatPKR(totalPkr)} <span className="text-xs font-normal text-muted-foreground">total</span>
          </span>
        </button>
        {open && (
          <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {parked.map((b) => (
              <div key={b.vendor_account_id} className="flex items-baseline justify-between gap-2 px-4 py-2">
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {b.name} <span className="text-muted-foreground/60">· {vendorTag(b)}</span>
                </span>
                <span className="font-heading text-sm font-bold tabular-nums">{formatPKR(b.balance_pkr)}</span>
              </div>
            ))}
            {parked.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground sm:col-span-3">No parked credit. No vendor currently holds a positive balance.</p>}
          </div>
        )}
      </div>

      {can("edit") && (
        <div className="flex justify-end gap-2">
          <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Make payment
          </Button>
        </div>
      )}

      {/* Ledger */}
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <SortHead label="Date" sortKey="date" sort={sort} className="text-white" />
              <SortHead label="Vendor" sortKey="vendor" sort={sort} className="text-white" />
              <SortHead label="Type" sortKey="type" sort={sort} className="text-white" />
              <SortHead label="Amount" sortKey="amount" sort={sort} className="text-white text-right" align="right" />
              <SortHead label="Note" sortKey="note" sort={sort} className="text-white" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sort.sorted.map((e) => {
              const isReversal = !!e.reverses_id;
              const label = isReversal ? "Reversal" : e.kind === "topup" ? "Payment" : "Draw-down";
              const tone = isReversal
                ? "border-border bg-muted text-muted-foreground"
                : e.kind === "topup"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-amber-200 bg-amber-50 text-amber-700";
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(e.occurred_on)}</TableCell>
                  <TableCell>
                    <p>{e.vendor_accounts?.name ?? "—"}</p>
                    {e.vendor_accounts && <p className="text-xs text-muted-foreground">{vendorTag(e.vendor_accounts)}</p>}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tone)}>{label}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e.kind === "topup" ? "+" : "−"}{formatPKR(e.amount_pkr)}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{e.note}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {ledgerQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
        {ledgerQ.isError && <p className="p-6 text-center text-[#cc0000]">{(ledgerQ.error as Error).message}</p>}
        {!ledgerQ.isLoading && !ledgerQ.isError && (ledgerQ.data ?? []).length === 0 && (
          <p className="p-6 text-center text-muted-foreground">Nothing recorded yet. Make a payment to start.</p>
        )}
      </div>

      <VendorAdvanceDialog open={dialogOpen} onOpenChange={setDialogOpen} vendors={balancesQ.data ?? []} />
    </div>
  );
}
