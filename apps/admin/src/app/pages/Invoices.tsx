// Module 3 — Invoicing. DB-backed list (balance/status from invoice_balances) +
// create + detail / payments / reversal / void / print. Invoices are issued, not
// edited; admin-only delete (DB RESTRICTs when payments exist).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { InvoiceFormDialog } from "../components/invoicing/InvoiceFormDialog";
import { InvoiceDetail } from "../components/invoicing/InvoiceDetail";
import { QuotationFormDialog } from "../components/invoicing/QuotationFormDialog";
import { QuotationDetailDialog } from "../components/invoicing/QuotationDetailDialog";
import { PromoteQuotationDialog } from "../components/invoicing/PromoteQuotationDialog";
import { useInvoices, useDeleteInvoice, type InvoiceListItem, type InvoiceStatus } from "../data/invoices";
import { useQuotations, usePromoteQuotation, type QuotationRecord, type PromoteLine } from "../data/quotations";
import { useAuth } from "../data/auth";
import { formatPKR, formatDate } from "@360/lib/format";
import { shipModeLabel } from "../components/invoicing/printDoc";
import { useTableSort, SortHead } from "../components/common/useTableSort";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@360/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@360/ui/tabs";
import { QuerySheetsTab } from "../components/invoicing/QuerySheetsTab";
import { useConfirm } from "../components/common/confirm";

const STATUSES: (InvoiceStatus | "all")[] = ["all", "paid", "partial", "unpaid", "overdue", "void"];
const STATUS_FILTER_LABEL: Record<string, string> = {
  all: "All statuses", paid: "Paid", partial: "Partial", unpaid: "Unpaid", overdue: "Overdue", void: "Void",
};
const BADGE_LABEL: Record<string, string> = {
  paid: "Paid", partial: "Partial", unpaid: "Unpaid", overdue: "Overdue", void: "Void",
};
// "queries" is admin-only (rough working sheets carrying acquisition cost + margin). Non-admins
// never get the tab, and the DB refuses them regardless — see migration 090110.
const DOC_TABS = ["invoices", "quotations", "queries"] as const;
type DocTab = (typeof DOC_TABS)[number];

export function Invoices() {
  const invoicesQ = useInvoices();
  const quotations = useQuotations();
  const promote = usePromoteQuotation();
  const del = useDeleteInvoice();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formOrderId, setFormOrderId] = useState<string | null>(null);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [quotationOrderId, setQuotationOrderId] = useState<string | null>(null);
  const [activeQuotationId, setActiveQuotationId] = useState<string | null>(null);
  const [promoteQuote, setPromoteQuote] = useState<QuotationRecord | null>(null);
  const [queryOpen, setQueryOpen] = useState(false);

  // Cross-link entry points: /invoices?invoice=<id> opens that invoice; /invoices?new=1&order=<id>
  // opens the create form prefilled from that order (from an order's "Create invoice" button).
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  // ?tab=queries from a non-admin (a shared link, a stale bookmark) falls back rather than
  // rendering an empty page — the tab isn't theirs to see.
  const wantedTab = requestedTab && DOC_TABS.includes(requestedTab as DocTab) ? (requestedTab as DocTab) : "invoices";
  const activeTab: DocTab = wantedTab === "queries" && !can("manage") ? "invoices" : wantedTab;

  function setTab(nextTab: DocTab) {
    const next = new URLSearchParams(params);
    if (nextTab === "invoices") next.delete("tab");
    else next.set("tab", nextTab);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const invId = params.get("invoice");
    const quoteId = params.get("quotation");
    const isNew = params.get("new") === "1";
    if (!invId && !quoteId && !isNew) return;
    if (invId) setActiveId(invId);
    if (quoteId) setActiveQuotationId(quoteId);      // ?tab=quotations&quotation=<id> pops the quote open
    if (isNew) { setFormOrderId(params.get("order")); setFormOpen(true); }
    const next = new URLSearchParams(params);
    next.delete("invoice"); next.delete("quotation"); next.delete("new"); next.delete("order");
    if (!quoteId) next.delete("tab");                 // keep tab=quotations when opening a quote
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (invoicesQ.data ?? []).filter((inv) => {
      const matchesQ =
        !term ||
        (inv.invoice_no ?? "").toLowerCase().includes(term) ||
        (inv.customers?.name ?? "").toLowerCase().includes(term);
      const matchesStatus = status === "all" || inv.balance?.status === status;
      return matchesQ && matchesStatus;
    });
  }, [invoicesQ.data, q, status]);

  const quotationRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return quotations.quotations.filter((quote) => {
      return (
        !term ||
        quote.quote_no.toLowerCase().includes(term) ||
        quote.customer.name.toLowerCase().includes(term) ||
        (quote.order_no ?? "").toLowerCase().includes(term)
      );
    });
  }, [quotations.quotations, q]);

  const invSort = useTableSort(rows, {
    invoice: (i) => i.invoice_no ?? "",
    customer: (i) => i.customers?.name ?? "",
    date: (i) => i.issue_date,
    shipping: (i) => (i.invoice_items.length ? shipModeLabel(i.invoice_items.map((x) => x.shipping_type)) : ""),
    total: (i) => i.total_pkr,
    balance: (i) => i.balance?.balance_pkr ?? i.total_pkr,
    status: (i) => i.balance?.status ?? "",
  }, "date", "desc");

  const quoteSort = useTableSort(quotationRows, {
    quote: (x) => x.quote_no,
    customer: (x) => x.customer.name,
    date: (x) => x.issue_date,
    shipping: (x) => (x.items.length ? shipModeLabel(x.items.map((it) => it.shipping_type)) : ""),
    total: (x) => x.total_pkr,
    order: (x) => x.order_no ?? "",
  }, "date", "desc");

  const activeQuotation = quotationRows.find((quote) => quote.id === activeQuotationId) ?? null;

  const confirm = useConfirm();

  async function remove(inv: InvoiceListItem) {
    if (!(await confirm({ title: `Delete ${inv.invoice_no}?`, destructive: true }))) return;
    try {
      await del.mutateAsync(inv.id);
      toast.success("Invoice deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  async function removeQuotation(quote: QuotationRecord) {
    if (!(await confirm({ title: `Delete ${quote.quote_no}?`, destructive: true }))) return;
    try {
      await quotations.deleteQuotation(quote.id);
      toast.success("Quotation deleted");
      if (activeQuotationId === quote.id) setActiveQuotationId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  async function createQuotation(input: Parameters<typeof quotations.createQuotation>[0]) {
    const created = await quotations.createQuotation(input);
    setActiveQuotationId(created.id);
  }

  // Promote a quotation → invoice (+ an order on the pipeline). Opens a dialog to set the final
  // prices; the out-of-stock warning lives there. The invoice links back to the quotation.
  function openPromote(quote: QuotationRecord) {
    setPromoteQuote(quote);
    setActiveQuotationId(null);
  }
  async function confirmPromote(lines: PromoteLine[]) {
    if (!promoteQuote) return;
    try {
      const { invoiceId } = await promote.mutateAsync({ quote: promoteQuote, items: lines });
      toast.success("Quotation promoted to invoice");
      setPromoteQuote(null);
      setTab("invoices");
      setActiveId(invoiceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not promote quotation.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Sales Documents"
        subtitle="Manage invoices and quotations for every customer"
        actions={
          activeTab === "queries" ? (
            can("manage") && (
              <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => setQueryOpen(true)}>
                <Plus className="size-4" /> New Query
              </Button>
            )
          ) : can("edit") && (
            activeTab === "quotations" ? (
              <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => setQuotationOpen(true)}>
                <Plus className="size-4" /> New Quotation
              </Button>
            ) : (
              <Button className="bg-[#cc0000] text-white hover:bg-[#a30000]" onClick={() => setFormOpen(true)}>
                <Plus className="size-4" /> New Invoice
              </Button>
            )
          )
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as DocTab)}>
        <TabsList className="mb-4 h-12 w-full">
          <TabsTrigger value="invoices" className="text-base font-medium">Invoices</TabsTrigger>
          <TabsTrigger value="quotations" className="text-base font-medium">Quotations</TabsTrigger>
          {can("manage") && <TabsTrigger value="queries" className="text-base font-medium">Queries</TabsTrigger>}
        </TabsList>

        <TabsContent value="invoices">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by invoice no. or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus | "all")}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_FILTER_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  <SortHead label="Invoice" sortKey="invoice" sort={invSort} className="text-white" />
                  <SortHead label="Customer" sortKey="customer" sort={invSort} className="text-white" />
                  <SortHead label="Date" sortKey="date" sort={invSort} className="text-white" />
                  <SortHead label="Shipping" sortKey="shipping" sort={invSort} className="text-white" />
                  <SortHead label="Total" sortKey="total" sort={invSort} className="text-right text-white" align="right" />
                  <SortHead label="Balance" sortKey="balance" sort={invSort} className="text-right text-white" align="right" />
                  <SortHead label="Status" sortKey="status" sort={invSort} className="text-white" />
                  {can("delete") && <TableHead className="w-12 text-white" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invSort.sorted.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => setActiveId(inv.id)}>
                    <TableCell className="font-medium tabular-nums">{inv.invoice_no}</TableCell>
                    <TableCell>{inv.customers?.name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.issue_date)}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.invoice_items.length ? shipModeLabel(inv.invoice_items.map((it) => it.shipping_type)) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPKR(inv.total_pkr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPKR(inv.balance?.balance_pkr ?? inv.total_pkr)}</TableCell>
                    <TableCell>{inv.balance && <StatusBadge status={BADGE_LABEL[inv.balance.status] ?? inv.balance.status} />}</TableCell>
                    {can("delete") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => remove(inv)}><Trash2 className="size-4 text-[#cc0000]" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {!invoicesQ.isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={can("delete") ? 8 : 7} className="py-10 text-center text-muted-foreground">
                      No invoices match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {invoicesQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
            {invoicesQ.isError && <p className="p-6 text-center text-[#cc0000]">{(invoicesQ.error as Error).message}</p>}
          </div>
        </TabsContent>

        <TabsContent value="quotations">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by quote no. or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  <SortHead label="Quote" sortKey="quote" sort={quoteSort} className="text-white" />
                  <SortHead label="Customer" sortKey="customer" sort={quoteSort} className="text-white" />
                  <SortHead label="Date" sortKey="date" sort={quoteSort} className="text-white" />
                  <SortHead label="Shipping" sortKey="shipping" sort={quoteSort} className="text-white" />
                  <SortHead label="Total" sortKey="total" sort={quoteSort} className="text-right text-white" align="right" />
                  <SortHead label="Linked order" sortKey="order" sort={quoteSort} className="text-white" />
                  <TableHead className="w-12 text-white" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quoteSort.sorted.map((quote) => (
                  <TableRow key={quote.id} className="cursor-pointer" onClick={() => setActiveQuotationId(quote.id)}>
                    <TableCell className="font-medium tabular-nums">{quote.quote_no}</TableCell>
                    <TableCell>{quote.customer.name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(quote.issue_date)}</TableCell>
                    <TableCell className="text-muted-foreground">{quote.items.length ? shipModeLabel(quote.items.map((it) => it.shipping_type)) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPKR(quote.total_pkr)}</TableCell>
                    <TableCell>{quote.order_no ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => removeQuotation(quote)}>
                        <Trash2 className="size-4 text-[#cc0000]" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!quotations.isLoading && !quotationRows.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No quotations yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {quotations.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
            {quotations.isError && <p className="p-6 text-center text-[#cc0000]">{quotations.error?.message}</p>}
          </div>
        </TabsContent>

        {can("manage") && (
          <TabsContent value="queries">
            <QuerySheetsTab newOpen={queryOpen} onNewOpenChange={setQueryOpen} />
          </TabsContent>
        )}
      </Tabs>

      <InvoiceDetail invoiceId={activeId} open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)} />
      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setFormOrderId(null); }}
        initialOrderId={formOrderId}
      />
      <QuotationFormDialog
        open={quotationOpen}
        onOpenChange={(o) => { setQuotationOpen(o); if (!o) setQuotationOrderId(null); }}
        initialOrderId={quotationOrderId}
        onCreate={createQuotation}
      />
      <QuotationDetailDialog
        quote={activeQuotation}
        open={!!activeQuotation}
        onOpenChange={(o) => !o && setActiveQuotationId(null)}
        onDelete={(id) => { const quote = quotations.quotations.find((x) => x.id === id); if (quote) removeQuotation(quote); }}
        onPromote={openPromote}
        promoting={promote.isPending}
        canPromote={can("edit")}
        canEdit={can("edit")}
      />
      <PromoteQuotationDialog
        quote={promoteQuote}
        open={!!promoteQuote}
        onOpenChange={(o) => !o && setPromoteQuote(null)}
        onConfirm={confirmPromote}
        submitting={promote.isPending}
      />
    </div>
  );
}
