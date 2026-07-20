// Shared kit for the catalogue detail tables (Investor + In-House). Both tables are declared as a
// list of column descriptors and rendered by <CatalogTable>, so sorting, the Essentials/Full
// density toggle, section super-headers, CSV export, subtotals, and a grand total all derive from
// one config instead of positional cells. Cells share the money/int/percent helpers below.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { formatPKR, formatCompact, formatDate } from "@360/lib/format";
import { cn } from "@360/ui/utils";

export type Align = "left" | "right" | "center";

export interface Col<Row> {
  key: string;
  label: string; // may contain "\n" for a two-line header
  group: string; // section name (drives the super-header + section divider)
  align: Align;
  pinned?: boolean; // the Item column — sticky, always shown
  essential?: boolean; // shown in the "Essentials" density preset
  essentialOrder?: number; // position within Essentials (declaration order otherwise)
  sortVal?: (r: Row) => number | string | null; // sortable when set
  render: (r: Row) => ReactNode;
  total?: (rows: Row[]) => ReactNode; // subtotal / grand-total cell (blank when omitted)
  csv?: (r: Row) => string | number; // retained for a future CSV export (feature currently off)
  cellClass?: (r: Row) => string; // e.g. unpaid-amount highlight
}

// Whole-row tint for a product at or below its reorder point. Amber, matching the "Low Stock"
// availability badge; hover still wins so the row keeps its normal click feedback.
export const LOW_STOCK_ROW = "bg-amber-50";

export interface Kpi {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
}

// ---- cell helpers -----------------------------------------------------------------------------
export const dash = <span className="text-muted-foreground/40">–</span>;
const compactPKR = (v: number) => formatCompact(v); // formatCompact already carries the "Rs " prefix

export function money(v: number | null, opts?: { strong?: boolean; muteZero?: boolean }): ReactNode {
  if (v == null || (v === 0 && opts?.muteZero !== false)) return dash;
  return <span title={formatPKR(v)} className={opts?.strong ? "font-medium tabular-nums" : "tabular-nums"}>{compactPKR(v)}</span>;
}
export function int(v: number, muteZero = true): ReactNode {
  return v === 0 && muteZero ? dash : <span className="tabular-nums">{v}</span>;
}
export function pct(num: number, den: number, tone?: (p: number) => string): ReactNode {
  if (den <= 0) return dash;
  const p = (num / den) * 100;
  return <span className={cn("tabular-nums", tone?.(p))}>{p.toFixed(1)}%</span>;
}
export function date(v: string | null): ReactNode {
  return v ? <span className="text-muted-foreground">{formatDate(v)}</span> : dash;
}

const PO_STATUS: Record<string, { label: string; cls: string }> = {
  planning: { label: "Planning", cls: "border-border bg-muted text-muted-foreground" },
  approved: { label: "Approved", cls: "border-border bg-muted text-muted-foreground" },
  ordered: { label: "Ordered", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  in_production: { label: "In production", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  in_transit: { label: "In transit → PAK", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  received: { label: "Received", cls: "border-green-200 bg-green-50 text-green-700" },
  cancelled: { label: "Cancelled", cls: "border-[#cc0000]/30 bg-[#cc0000]/10 text-[#cc0000]" },
};
export function statusPill(s: string | null): ReactNode {
  const st = s ? PO_STATUS[s] : null;
  return st ? <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", st.cls)}>{st.label}</span> : dash;
}
export const statusLabel = (s: string | null) => (s ? (PO_STATUS[s]?.label ?? s) : "");

const KPI_TONE: Record<string, string> = {
  default: "text-foreground",
  good: "text-green-700",
  warn: "text-amber-700",
  bad: "text-[#cc0000]",
};

function cmp(a: number | string | null, b: number | string | null): number {
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function CatalogTable<Row>({
  rows,
  columns,
  groupBy,
  rowKey,
  onRowClick,
  kpis,
  unit,
  rowClass,
}: {
  rows: Row[];
  columns: Col<Row>[];
  groupBy: (r: Row) => string;
  rowKey: (r: Row) => string;
  onRowClick?: (r: Row) => void;
  kpis: Kpi[];
  unit: string; // "item" | "purchase" — group count label
  rowClass?: (r: Row) => string; // whole-row tint, e.g. the low-stock highlight
}) {
  const [preset, setPreset] = useState<"full" | "essentials">("full");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (g: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  // Essentials is a deliberate, client-specified sequence (cost → prices → profit → stock left),
  // which does not follow the Full view's section order — so it sorts on essentialOrder. The sort
  // is stable, so columns that omit it keep their declaration order.
  const shown = useMemo(() => {
    if (preset !== "essentials") return columns;
    return columns
      .filter((c) => c.pinned || c.essential)
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.essentialOrder ?? 0) - (b.essentialOrder ?? 0));
  }, [columns, preset]);

  // sort rows (globally) by the active sortable column, then group — each group stays sorted.
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortVal) return rows;
    const sv = col.sortVal;
    const dir = sort.dir;
    return [...rows].sort((a, b) => cmp(sv(a), sv(b)) * dir);
  }, [rows, sort, columns]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of sorted) {
      const g = groupBy(r);
      (m.get(g) ?? m.set(g, []).get(g)!).push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sorted, groupBy]);

  // Essentials are the figures the client actually reads. In Full view they sit scattered among ~25
  // columns, so they carry a soft tint + bold to stay findable without shouting. The pinned
  // Item column is excluded (it's the row label, always shown), and Essentials view gets no emphasis
  // at all — every column shown there is essential, so tinting them would just be noise.
  const isEmph = (c: Col<Row>) => preset === "full" && !!c.essential && !c.pinned;
  // Bold + a soft tint, same type size as everything else. [&_*] is needed because several cells
  // render their own inner span with a font-medium of its own (money({strong}), profitCell) which
  // would otherwise win over a weight set on the td.
  // The tint paints over the row's own background, so it needs its own hover step or the band
  // would swallow the row-hover feedback (the pinned column solves this the same way).
  const EMPH_CELL = "bg-[#cc0000]/[0.04] font-semibold [&_*]:font-semibold group-hover:bg-[#cc0000]/[0.09]";
  const EMPH_HEAD = "border-b-2 border-[#cc0000] font-bold";
  const EMPH_TOTAL = "bg-[#cc0000]/[0.07] font-bold [&_*]:font-bold"; // band continues, a shade deeper
  const EMPH_GROUP = "text-[#cc0000]"; // super-header label, brand red on the black bar
  const emphCell = (c: Col<Row>) => (isEmph(c) ? EMPH_CELL : "");
  const emphHead = (c: Col<Row>) => (isEmph(c) ? EMPH_HEAD : "");

  // Section super-header runs. A run merges consecutive columns that share a group AND share the
  // same emphasis — the emphasis break matters: the Essentials columns are scattered through the
  // groups (e.g. only "Per Unit Cost" is essential inside Cost), so a run keyed on group alone
  // would span both emphasised and plain columns and could not be marked as either. Splitting on
  // emphasis keeps every super-header cell uniformly one or the other. A group that gets split
  // shows its label on its FIRST run only, so "Cost" is not repeated over each fragment.
  const runs = useMemo(() => {
    const out: { group: string; span: number; emph: boolean; label: string }[] = [];
    for (const c of shown) {
      const emph = isEmph(c);
      const last = out[out.length - 1];
      if (last && last.group === c.group && last.emph === emph) last.span++;
      else out.push({ group: c.group, span: 1, emph, label: "" });
    }
    const labelled = new Set<string>();
    for (const r of out) {
      if (!labelled.has(r.group)) {
        r.label = r.group;
        labelled.add(r.group);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, preset]);
  const startsSection = (i: number) => i > 0 && shown[i].group !== shown[i - 1].group;

  const alignCls = (a: Align) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "");
  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));

  const TotalRow = ({ label, rowsIn, grand }: { label: string; rowsIn: Row[]; grand?: boolean }) => (
    <tr className={cn("border-t", grand ? "border-t-2 border-[#cc0000] bg-secondary font-semibold" : "border-border bg-secondary/60 font-medium")}>
      {shown.map((c, i) => (
        <td
          key={c.key}
          className={cn(
            "px-3 py-2",
            alignCls(c.align),
            startsSection(i) && "border-l border-border/60",
            // Carry the tint through the subtotal / grand-total rows so the band is unbroken, a
            // shade deeper so the total still reads as a total rather than as one more data row.
            isEmph(c) && EMPH_TOTAL,
            c.pinned && cn("sticky left-0 z-10", grand ? "bg-secondary" : "bg-secondary/60 backdrop-blur"),
          )}
        >
          {c.pinned ? label : c.total?.(rowsIn)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-3">
      {/* KPI strip + toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {kpis.map((k) => (
            <div key={k.label}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
              <p className={cn("[font-family:var(--font-heading)] text-lg font-bold tabular-nums", KPI_TONE[k.tone ?? "default"])}>{k.value}</p>
            </div>
          ))}
        </div>
        <div className="flex rounded-md border border-border text-xs">
          <button className={cn("px-2.5 py-1", preset === "essentials" ? "bg-secondary font-medium" : "text-muted-foreground")} onClick={() => setPreset("essentials")}>Essentials</button>
          <button className={cn("px-2.5 py-1", preset === "full" ? "bg-secondary font-medium" : "text-muted-foreground")} onClick={() => setPreset("full")}>Full</button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-19rem)] overflow-auto rounded-md border border-border bg-card pb-2">
        <table className="w-full border-collapse text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-20">
            {/* section super-headers */}
            <tr className="bg-black text-left text-white">
              {runs.map((r, i) => (
                <th
                  key={i}
                  colSpan={r.span}
                  className={cn(
                    "bg-black px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50",
                    i === 0 && "sticky left-0 z-30",
                    i > 0 && "border-l border-white/10 text-center",
                    // mark the band from the very top of the table, so the group label above an
                    // emphasised run reads as part of it rather than as a plain section heading
                    r.emph && EMPH_GROUP,
                  )}
                >
                  {i === 0 ? "" : r.label}
                </th>
              ))}
            </tr>
            {/* column headers */}
            <tr className="bg-black text-left text-white">
              {shown.map((c, i) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={c.sortVal ? () => toggleSort(c.key) : undefined}
                    className={cn(
                      "bg-black px-3 pb-2 align-bottom [font-family:var(--font-heading)] text-xs font-semibold uppercase",
                      alignCls(c.align),
                      c.pinned && "sticky left-0 z-30 shadow-[1px_0_0_rgba(255,255,255,0.12)]",
                      startsSection(i) && "border-l border-white/10",
                      c.sortVal && "cursor-pointer select-none hover:text-white",
                      active && "text-white",
                      emphHead(c),
                    )}
                  >
                    <span className={cn("inline-flex items-end gap-1", c.align === "right" && "flex-row-reverse")}>
                      <span className="whitespace-pre-line leading-tight">{c.label}</span>
                      {c.sortVal && (active ? (sort!.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ChevronsUpDown className="size-3 opacity-30" />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, items]) => {
              const isCol = collapsed.has(group);
              return (
                <Fragment key={group}>
                  <tr className="cursor-pointer border-y border-border bg-muted hover:bg-muted/70" onClick={() => toggleGroup(group)}>
                    <td colSpan={shown.length} className="bg-muted p-0">
                      <span className="sticky left-0 flex w-fit items-center gap-2 bg-muted px-3 py-2.5">
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isCol && "-rotate-90")} />
                        <span className="text-sm font-semibold text-foreground">{group}</span>
                        <span className="text-xs text-muted-foreground">· {items.length} {unit}{items.length === 1 ? "" : "s"}</span>
                      </span>
                    </td>
                  </tr>
                  {isCol ? (
                    <TotalRow label="Subtotal" rowsIn={items} />
                  ) : (
                    <>
                      {items.map((r) => (
                        <tr
                          key={rowKey(r)}
                          className={cn("group border-b border-border/60 bg-card hover:bg-secondary", onRowClick && "cursor-pointer", rowClass?.(r))}
                          onClick={onRowClick ? () => onRowClick(r) : undefined}
                        >
                          {shown.map((c, i) => (
                            <td
                              key={c.key}
                              className={cn(
                                "px-3 py-2",
                                alignCls(c.align),
                                startsSection(i) && "border-l border-border/60",
                                emphCell(c),
                                // bg-inherit, not bg-card: the sticky cell still needs an opaque
                                // background, but it must take the ROW's colour so a row tint
                                // (e.g. the low-stock highlight) isn't painted over by the pin.
                                c.pinned && "sticky left-0 z-10 bg-inherit font-medium shadow-[1px_0_0_var(--border)] group-hover:bg-secondary",
                                c.cellClass?.(r),
                              )}
                            >
                              {c.render(r)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {items.length > 1 && <TotalRow label="Subtotal" rowsIn={items} />}
                    </>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={shown.length} className="py-10 text-center text-muted-foreground">Nothing matches your filters.</td>
              </tr>
            )}
          </tbody>
          {groups.length > 1 && (
            <tfoot className="sticky bottom-0 z-20">
              <TotalRow label="Grand total" rowsIn={rows} grand />
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
