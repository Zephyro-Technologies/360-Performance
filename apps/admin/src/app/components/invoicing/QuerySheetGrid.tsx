// The Excel-like grid for one query sheet. Same look as the In-House catalogue table (black sticky
// header with section super-headers, pinned Item column, subtotal footer) — but every INPUT cell is
// a real input and every DERIVED cell recomputes live as you type.
//
// Editing model: typing updates local draft state only; the row is persisted on blur (one UPDATE
// per row). That keeps the derived columns instant while you type without a write per keystroke.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, PackageSearch, PackagePlus, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { formatPKR } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { useProducts, useSuppliers } from "../../data/catalog";
import { useOneoffProducts } from "../../data/oneoffProducts";
import {
  useAddQuerySheetRows,
  useUpdateQuerySheetRow,
  useDeleteQuerySheetRow,
  useUpdateQuerySheet,
  type QuerySheetDetail,
} from "../../data/querySheets";
import { resolveColumns, cellValue, cellKeyOf, columnTotal, type SheetCells, type SheetCol } from "./querySheetColumns";

const alignCls = (a: SheetCol["align"]) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "");

// Display for a read-only derived cell. Money is compact-with-title like the catalogue; a null
// (nothing priced yet) shows the same muted dash rather than a misleading 0.
function derivedText(col: SheetCol, v: number | string | null) {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  if (col.percent) return `${v.toFixed(1)}%`;
  if (col.money) return formatPKR(v);
  return String(v);
}

export function QuerySheetGrid({ sheet, editable }: { sheet: QuerySheetDetail; editable: boolean }) {
  const addRows = useAddQuerySheetRows(sheet.id);
  const updateRow = useUpdateQuerySheetRow(sheet.id);
  const deleteRow = useDeleteQuerySheetRow(sheet.id);
  const productsQ = useProducts();
  const oneoffQ = useOneoffProducts();
  const suppliersQ = useSuppliers();
  const updateSheet = useUpdateQuerySheet();
  const [picking, setPicking] = useState<"catalogue" | "oneoff" | null>(null);
  const [term, setTerm] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  // Only the columns this sheet was created with (or later edited to have), in the operator's
  // saved order, with any custom columns they defined merged in.
  const columns = useMemo(
    () => resolveColumns(sheet.columns, sheet.custom_columns),
    [sheet.columns, sheet.custom_columns],
  );

  // Full-screen: the sheet is wide, so the useful mode is "nothing but the grid". Esc leaves, and
  // the page behind is scroll-locked so a stray wheel doesn't move it under the overlay.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't steal Esc from a cell being edited — blur first, leave full screen on the next press.
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  // ---- drag a header to move that column ---------------------------------------------------------
  // The pinned Item column is the row label and is `sticky left-0`; it only works as the FIRST
  // column, so it neither drags nor accepts a drop.
  async function moveColumn(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    const order = columns.map((c) => c.key);
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    try {
      await updateSheet.mutateAsync({ id: sheet.id, columns: next });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move the column");
    }
  }

  // Draft cells keyed by row id. Server rows seed it; a row being edited keeps its local value so a
  // background refetch can't yank the cell out from under the cursor.
  const [drafts, setDrafts] = useState<Record<string, SheetCells>>({});
  const dirty = useRef<Set<string>>(new Set());
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, SheetCells> = {};
      for (const r of sheet.rows) next[r.id] = dirty.current.has(r.id) ? (prev[r.id] ?? r.cells) : r.cells;
      return next;
    });
  }, [sheet.rows]);

  const rows = sheet.rows.map((r) => ({ ...r, cells: drafts[r.id] ?? r.cells }));
  const allCells = rows.map((r) => r.cells);

  // Writes to the column's CELL key, not its column key — two columns may share one value
  // (Quantity is shown in both the request and the purchase block), and they must stay in step.
  function setCell(rowId: string, raw: string, col: SheetCol) {
    dirty.current.add(rowId);
    const value = col.kind === "number" ? (raw === "" ? null : Number(raw)) : raw === "" ? null : raw;
    setDrafts((d) => ({ ...d, [rowId]: { ...(d[rowId] ?? {}), [cellKeyOf(col)]: value } }));
  }

  // Checkbox columns store 1/0 rather than true/false: the cells blob is shared with number and
  // text columns, and 1/0 survives a CSV round-trip and sums in the footer as a count.
  function setBool(rowId: string, next: boolean, col: SheetCol) {
    dirty.current.add(rowId);
    setDrafts((d) => ({ ...d, [rowId]: { ...(d[rowId] ?? {}), [cellKeyOf(col)]: next ? 1 : 0 } }));
    void commitLater(rowId, { ...(drafts[rowId] ?? {}), [cellKeyOf(col)]: next ? 1 : 0 });
  }

  // A checkbox has no blur, so it persists immediately with the value we just computed.
  async function commitLater(rowId: string, cells: SheetCells) {
    dirty.current.delete(rowId);
    try {
      await updateRow.mutateAsync({ id: rowId, cells });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the row");
    }
  }

  async function commit(rowId: string) {
    if (!dirty.current.has(rowId)) return;
    dirty.current.delete(rowId);
    try {
      await updateRow.mutateAsync({ id: rowId, cells: drafts[rowId] ?? {} });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the row");
    }
  }

  async function addBlank() {
    try {
      await addRows.mutateAsync([{ position: rows.length, cells: {} }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add a row");
    }
  }

  async function seed(cells: SheetCells, productId: string | null) {
    try {
      await addRows.mutateAsync([{ position: rows.length, product_id: productId, cells }]);
      setPicking(null);
      setTerm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the row");
    }
  }

  // Seed from the catalogue: name + the product's current prices, so the operator only types the
  // cost build-up. Everything stays editable — this is a starting point, not a link.
  const addFromCatalogue = (id: string) => {
    const p = (productsQ.data ?? []).find((x) => x.id === id);
    if (!p) return;
    seed({ name: p.name, qty: 1, retail: p.price_pkr ?? null, reseller: p.reseller_price_pkr ?? null }, p.id);
  };

  // Seed from a one-off product. A one-off carries a single already-landed PKR cost that doesn't
  // decompose into RMB + shipping + packaging, so it goes in as unit cost at rate 1 — the same
  // convention the workbook import uses to carry a PKR cost through the RMB columns. That makes
  // the sheet's "Per Unit Cost" land on exactly the one-off's landed cost.
  const addFromOneoff = (id: string) => {
    const o = (oneoffQ.data ?? []).find((x) => x.id === id);
    if (!o) return;
    const vendor = (suppliersQ.data ?? []).find((s) => s.id === o.supplier_id)?.name ?? null;
    seed(
      {
        name: o.oem_part_no ? `${o.name} (${o.oem_part_no})` : o.name,
        qty: 1,
        unitCostRmb: o.landed_cost_pkr,
        rmbRate: 1,
        retail: o.sale_price_pkr,
        vendor,
      },
      null, // one-offs aren't catalogue products; there's no products row to point at
    );
  };

  // Section super-header runs, same as the catalogue table.
  const runs = useMemo(() => {
    const out: { label: string; span: number }[] = [];
    for (const c of columns) {
      const last = out[out.length - 1];
      if (last && last.label === c.group) last.span++;
      else out.push({ label: c.group, span: 1 });
    }
    return out;
  }, [columns]);
  const startsSection = (i: number) => i > 0 && columns[i].group !== columns[i - 1].group;

  // Both pickers share one search box; each row shows its own secondary label (SKU / OEM #).
  const t = term.trim().toLowerCase();
  const matches =
    picking === "oneoff"
      ? (oneoffQ.data ?? [])
          .filter((o) => o.active)
          .filter((o) => !t || o.name.toLowerCase().includes(t) || (o.oem_part_no ?? "").toLowerCase().includes(t))
          .map((o) => ({ id: o.id, name: o.name, meta: o.oem_part_no }))
      : (productsQ.data ?? [])
          .filter((p) => !t || p.name.toLowerCase().includes(t) || (p.sku ?? "").toLowerCase().includes(t))
          .map((p) => ({ id: p.id, name: p.name, meta: p.sku }));

  return (
    <div
      className={cn(
        "space-y-3",
        fullscreen && "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background p-4",
      )}
    >
      {fullscreen && (
        <div className="flex shrink-0 items-center gap-2">
          <h2 className="truncate [font-family:var(--font-heading)] text-lg font-bold">{sheet.title}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{rows.length} rows · {columns.length} columns</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setFullscreen(false)}>
            <Minimize2 className="size-4" /> Exit full screen
          </Button>
        </div>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={addBlank} disabled={addRows.isPending}>
            <Plus className="size-4" /> Add row
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPicking((p) => (p === "catalogue" ? null : "catalogue"))}>
            <PackageSearch className="size-4" /> Add from catalogue
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPicking((p) => (p === "oneoff" ? null : "oneoff"))}>
            <PackagePlus className="size-4" /> Add from one-off products
          </Button>
          {!fullscreen && (
            <Button size="sm" variant="outline" onClick={() => setFullscreen(true)}>
              <Maximize2 className="size-4" /> Full screen
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Drag a column header to move it. Nothing here affects stock, orders or reporting.
          </span>
        </div>
      )}

      {!editable && !fullscreen && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setFullscreen(true)}>
            <Maximize2 className="size-4" /> Full screen
          </Button>
        </div>
      )}

      {picking && editable && (
        <div className="rounded-md border border-border bg-card p-3">
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={picking === "oneoff" ? "Search one-off products by name or OEM #…" : "Search the catalogue by name or SKU…"}
            className="mb-2 w-full rounded-md border border-input px-3 py-1.5 text-sm"
          />
          <div className="max-h-56 overflow-y-auto">
            {matches.slice(0, 50).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => (picking === "oneoff" ? addFromOneoff(m.id) : addFromCatalogue(m.id))}
                className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-secondary"
              >
                <span className="truncate">{m.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{m.meta}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                {picking === "oneoff" ? "No one-off products match." : "No products match."}
              </p>
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          "overflow-auto rounded-md border border-border bg-card",
          fullscreen ? "min-h-0 flex-1" : "max-h-[calc(100vh-22rem)]",
        )}
      >
        <table className="w-full border-collapse text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-20">
            <tr className="bg-black text-left text-white">
              {runs.map((r, i) => (
                <th key={i} colSpan={r.span} className={cn("bg-black px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50", i === 0 && "sticky left-0 z-30", i > 0 && "border-l border-white/10 text-center")}>
                  {i === 0 ? "" : r.label}
                </th>
              ))}
              {editable && <th className="bg-black" />}
            </tr>
            <tr className="bg-black text-left text-white">
              {columns.map((c, i) => {
                const movable = editable && !c.pinned;
                return (
                  <th
                    key={c.key}
                    draggable={movable}
                    onDragStart={movable ? () => setDragKey(c.key) : undefined}
                    onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                    onDragOver={movable ? (e) => { e.preventDefault(); if (overKey !== c.key) setOverKey(c.key); } : undefined}
                    onDragLeave={movable ? () => setOverKey((k) => (k === c.key ? null : k)) : undefined}
                    onDrop={
                      movable
                        ? (e) => {
                            e.preventDefault();
                            if (dragKey) void moveColumn(dragKey, c.key);
                            setDragKey(null);
                            setOverKey(null);
                          }
                        : undefined
                    }
                    title={movable ? "Drag to move this column" : undefined}
                    className={cn(
                      "bg-black px-3 pb-2 align-bottom [font-family:var(--font-heading)] text-xs font-semibold uppercase",
                      alignCls(c.align),
                      c.pinned && "sticky left-0 z-30 shadow-[1px_0_0_rgba(255,255,255,0.12)]",
                      startsSection(i) && "border-l border-white/10",
                      movable && "cursor-grab select-none",
                      dragKey === c.key && "opacity-40",
                      // Where it will land, drawn as an insertion edge rather than a fill so the
                      // header text stays readable while dragging.
                      overKey === c.key && dragKey && dragKey !== c.key && "shadow-[inset_2px_0_0_#cc0000]",
                    )}
                  >
                    <span className="whitespace-pre-line leading-tight">{c.label}</span>
                  </th>
                );
              })}
              {editable && <th className="w-10 bg-black" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="group border-b border-border/60 bg-card hover:bg-secondary">
                  {columns.map((c, i) => {
                    const v = cellValue(c, row.cells);
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "p-0",
                          startsSection(i) && "border-l border-border/60",
                          // Derived cells are visually distinct — a soft tint marks "computed, not typed".
                          c.derived && "bg-secondary/40 group-hover:bg-secondary",
                          c.pinned && "sticky left-0 z-10 bg-card font-medium shadow-[1px_0_0_var(--border)] group-hover:bg-secondary",
                        )}
                      >
                        {c.derived ? (
                          <span className={cn("block px-3 py-2 tabular-nums", alignCls(c.align), v == null && "text-muted-foreground/40")}>
                            {derivedText(c, v) ?? "–"}
                          </span>
                        ) : c.kind === "bool" ? (
                          <span className="flex items-center justify-center px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={c.label.replace(/\n/g, " ")}
                              checked={Number(row.cells[cellKeyOf(c)] ?? 0) > 0}
                              disabled={!editable}
                              onChange={(e) => setBool(row.id, e.target.checked, c)}
                              className="size-4 accent-[#cc0000] disabled:cursor-default"
                            />
                          </span>
                        ) : (
                          <input
                            type={c.kind === "number" ? "number" : c.kind === "date" ? "date" : "text"}
                            value={(row.cells[cellKeyOf(c)] ?? "") as string | number}
                            disabled={!editable}
                            onChange={(e) => setCell(row.id, e.target.value, c)}
                            onBlur={() => commit(row.id)}
                            className={cn(
                              "w-full min-w-[6rem] bg-transparent px-3 py-2 outline-none focus:bg-[#cc0000]/[0.06] focus:ring-1 focus:ring-inset focus:ring-[#cc0000]/40 disabled:cursor-default",
                              alignCls(c.align),
                              c.kind === "number" && "tabular-nums",
                              c.pinned && "min-w-[14rem] font-medium",
                            )}
                          />
                        )}
                      </td>
                    );
                  })}
                  {editable && (
                    <td className="px-1">
                      <button
                        type="button"
                        aria-label="Delete row"
                        onClick={() => deleteRow.mutate(row.id)}
                        className="rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-[#cc0000] group-hover:opacity-100"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (editable ? 1 : 0)} className="py-10 text-center text-muted-foreground">
                  Empty sheet. Add a row, or pull items in from the catalogue.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-20">
              <tr className="border-t-2 border-[#cc0000] bg-secondary font-semibold">
                {columns.map((c, i) => {
                  const t = columnTotal(c, allCells);
                  return (
                    <td key={c.key} className={cn("px-3 py-2", alignCls(c.align), startsSection(i) && "border-l border-border/60", c.pinned && "sticky left-0 z-10 bg-secondary")}>
                      {c.pinned ? "Total" : t == null ? null : <span className="tabular-nums">{c.money ? formatPKR(t) : t}</span>}
                    </td>
                  );
                })}
                {editable && <td className="bg-secondary" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
