// Sales Documents → Queries. A list of rough working sheets; picking one opens its grid.
// Admin-only (RLS enforces it server-side; this component is only rendered for admins).
import { useMemo, useState } from "react";
import { ArrowLeft, Columns3, FileSpreadsheet, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@360/lib/format";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { useAuth } from "../../data/auth";
import {
  useQuerySheets,
  useQuerySheet,
  useCreateQuerySheet,
  useUpdateQuerySheet,
  useDeleteQuerySheet,
} from "../../data/querySheets";
import { QuerySheetGrid } from "./QuerySheetGrid";
import { QuerySheetColumnPicker } from "./QuerySheetColumnPicker";
import { ALL_COLUMN_KEYS } from "./querySheetColumns";
import { Label } from "@360/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@360/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";

// `newOpen` is owned by the Invoices page: the "New Query" button lives in the page header
// alongside New Invoice / New Quotation, so the trigger sits outside this component. The dialog
// itself is mounted here at the tab root (not in SheetList) so it still opens while a sheet is open.
export function QuerySheetsTab({ newOpen, onNewOpenChange }: { newOpen: boolean; onNewOpenChange: (o: boolean) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const create = useCreateQuerySheet();
  const [title, setTitle] = useState("");
  const [columns, setColumns] = useState<string[]>(ALL_COLUMN_KEYS);

  async function add() {
    try {
      const id = await create.mutateAsync({ title, columns });
      onNewOpenChange(false);
      setTitle("");
      setColumns(ALL_COLUMN_KEYS);
      setOpenId(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the sheet");
    }
  }

  return (
    <>
      {openId ? <SheetView id={openId} onBack={() => setOpenId(null)} /> : <SheetList onOpen={setOpenId} />}

      <Dialog open={newOpen} onOpenChange={onNewOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New query sheet</DialogTitle>
            <DialogDescription>Name it, then tick the columns you want. You can change them later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="query-title">Name</Label>
              <Input
                id="query-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Civic FK8 build enquiry"
                className="max-w-sm"
              />
            </div>
            <div className="space-y-1">
              <Label>Columns</Label>
              <QuerySheetColumnPicker value={columns} onChange={setColumns} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onNewOpenChange(false)}>Cancel</Button>
            <Button onClick={add} disabled={create.isPending} className="bg-[#cc0000] text-white hover:bg-[#a30000]">
              {create.isPending ? "Creating…" : "Create query"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const SORTS = [
  { value: "edited", label: "Recently edited" },
  { value: "created", label: "Newest first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "rows", label: "Most rows" },
] as const;
type SheetSort = (typeof SORTS)[number]["value"];

function SheetList({ onOpen }: { onOpen: (id: string) => void }) {
  const sheetsQ = useQuerySheets();
  const del = useDeleteQuerySheet();
  const update = useUpdateQuerySheet();
  const { can } = useAuth();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SheetSort>("edited");

  async function rename(id: string, next: string, previous: string) {
    setRenaming(null);
    const v = next.trim();
    if (!v || v === previous) return; // a cleared name would leave an unopenable blank card
    try {
      await update.mutateAsync({ id, title: v });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename the sheet");
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This removes the whole sheet.`)) return;
    try {
      await del.mutateAsync(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the sheet");
    }
  }

  // Memoised so the `?? []` fallback doesn't mint a new array each render and re-run the sort.
  const all = useMemo(() => sheetsQ.data ?? [], [sheetsQ.data]);
  const sheets = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term ? all.filter((s) => s.title.toLowerCase().includes(term)) : all;
    // Sorting a copy — `all` is React Query's cached array and must not be mutated in place.
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "name": return a.title.localeCompare(b.title);
        case "rows": return b.row_count - a.row_count;
        case "created": return b.created_at.localeCompare(a.created_at);
        default: return b.updated_at.localeCompare(a.updated_at);
      }
    });
  }, [all, q, sort]);

  return (
    <div className="space-y-4">
      {/* Same search + filter row as the Invoices and Quotations tabs. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search queries by name…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SheetSort)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {sheetsQ.isLoading && <p className="p-6 text-center text-muted-foreground">Loading…</p>}
      {sheetsQ.isError && <p className="p-6 text-center text-[#cc0000]">Couldn&apos;t load query sheets.</p>}

      {/* "Nothing matches" is a different message from "nothing exists yet" — the second would
          read as data loss when it's really just an active search. */}
      {!sheetsQ.isLoading && sheets.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-10 text-center">
          <FileSpreadsheet className="mx-auto mb-2 size-6 text-muted-foreground" />
          {all.length > 0 ? (
            <p className="text-sm text-muted-foreground">No queries match &ldquo;{q.trim()}&rdquo;.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No query sheets yet. A query is rough working space — lay out items, cost them, and see the margin before
              it becomes a quotation.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sheets.map((s) => (
          <div key={s.id} className="group flex items-center justify-between gap-2 rounded-md border border-border bg-card p-3 transition-colors hover:border-foreground/30">
            <div className="min-w-0 flex-1">
              {renaming === s.id ? (
                <input
                  autoFocus
                  defaultValue={s.title}
                  aria-label="Sheet name"
                  onBlur={(e) => rename(s.id, e.target.value, s.title)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="w-full rounded-sm border border-input px-1.5 py-0.5 text-sm font-medium outline-none focus:ring-1 focus:ring-[#cc0000]/40"
                />
              ) : (
                <button type="button" onClick={() => onOpen(s.id)} className="w-full text-left">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                {s.row_count} {s.row_count === 1 ? "row" : "rows"} · edited {formatDate(s.updated_at)}
              </p>
            </div>
            {can("manage") && renaming !== s.id && (
              <button
                type="button"
                aria-label={`Rename ${s.title}`}
                onClick={() => setRenaming(s.id)}
                className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                <Pencil className="size-4" />
              </button>
            )}
            <button
              type="button"
              aria-label={`Delete ${s.title}`}
              onClick={() => remove(s.id, s.title)}
              className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-[#cc0000] group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SheetView({ id, onBack }: { id: string; onBack: () => void }) {
  const sheetQ = useQuerySheet(id);
  const update = useUpdateQuerySheet();
  const { can } = useAuth();
  const [colsOpen, setColsOpen] = useState(false);
  const [draftCols, setDraftCols] = useState<string[]>([]);

  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-md bg-[#cc0000]/10 px-2.5 py-1 text-sm font-medium text-[#cc0000] transition-colors hover:bg-[#cc0000]/20">
      <ArrowLeft className="size-4" /> All queries
    </button>
  );

  if (sheetQ.isLoading) return <div className="space-y-4">{back}<p className="p-6 text-center text-muted-foreground">Loading…</p></div>;
  if (!sheetQ.data) return <div className="space-y-4">{back}<p className="p-6 text-center text-[#cc0000]">This query sheet no longer exists.</p></div>;

  const sheet = sheetQ.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        {/* The name is edited in place. It needs a visible affordance or it reads as static text —
            hence the pencil, which is decorative: clicking the text itself focuses the field. */}
        <div className="group/name relative min-w-0 flex-1">
          <input
            key={sheet.title}
            defaultValue={sheet.title}
            disabled={!can("manage")}
            aria-label="Query sheet name"
            title={can("manage") ? "Click to rename" : undefined}
            placeholder="Name this query"
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              // Refuse a blank name rather than saving one; restore what was there.
              if (!v) { e.target.value = sheet.title; return; }
              if (v !== sheet.title) update.mutate({ id: sheet.id, title: v });
            }}
            className="w-full rounded-md border border-transparent px-2 py-1 pr-8 text-lg font-semibold outline-none hover:border-border focus:border-input disabled:cursor-default"
          />
          {can("manage") && (
            <Pencil className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100" />
          )}
        </div>
        {can("manage") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setDraftCols(sheet.columns.length ? sheet.columns : ALL_COLUMN_KEYS); setColsOpen(true); }}
          >
            <Columns3 className="size-4" /> Columns
          </Button>
        )}
      </div>

      <Dialog open={colsOpen} onOpenChange={setColsOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Columns for &ldquo;{sheet.title}&rdquo;</DialogTitle>
            <DialogDescription>Tick what this sheet shows. Hiding a column keeps whatever you already typed in it.</DialogDescription>
          </DialogHeader>
          <QuerySheetColumnPicker value={draftCols} onChange={setDraftCols} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setColsOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#cc0000] text-white hover:bg-[#a30000]"
              onClick={() => { update.mutate({ id: sheet.id, columns: draftCols }); setColsOpen(false); }}
            >
              Save columns
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuerySheetGrid sheet={sheet} editable={can("manage")} />
    </div>
  );
}
