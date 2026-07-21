// Column selector + layout editor for a query sheet — used both when creating a sheet and when
// changing an existing one. Three things happen here:
//   1. TICK which columns the sheet carries (grouped by section, with presets).
//   2. ORDER them by dragging (or the ↑/↓ buttons) — the saved order IS the sheet's layout.
//   3. ADD your own columns when the catalogue registry hasn't got what this query needs.
//
// Ticking appends to the end of the current order rather than re-sorting into declaration order:
// re-sorting would silently undo a layout the operator had just arranged by hand.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@360/ui/checkbox";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { cn } from "@360/ui/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import {
  COLUMNS,
  COLUMN_GROUPS,
  ALL_COLUMN_KEYS,
  ESSENTIAL_COLUMN_KEYS,
  QUERY_COLUMN_KEYS,
  REQUIRED_COLUMN_KEYS,
  CUSTOM_PREFIX,
  customToCol,
  type CellKind,
  type CustomColumnDef,
} from "./querySheetColumns";

// The header labels carry "\n" for the two-line table header; flatten it for the picker list.
const flat = (label: string) => label.replace(/\n/g, " ");

const KIND_LABEL: Record<CellKind, string> = { text: "Text", number: "Number", date: "Date", bool: "Yes / No" };

export function QuerySheetColumnPicker({
  value,
  onChange,
  custom,
  onCustomChange,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  custom: CustomColumnDef[];
  onCustomChange: (cols: CustomColumnDef[]) => void;
}) {
  const selected = useMemo(() => new Set(value), [value]);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<CellKind>("text");
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Every column this sheet could show, built-in + this sheet's own.
  const byKey = useMemo(() => {
    const m = new Map(COLUMNS.map((c) => [c.key, c]));
    for (const d of custom) m.set(d.key, customToCol(d));
    return m;
  }, [custom]);

  // Ordered, resolvable selection — the list rendered in the layout panel.
  const ordered = useMemo(() => value.map((k) => byKey.get(k)).filter((c): c is NonNullable<typeof c> => !!c), [value, byKey]);

  const withRequired = (keys: string[]) => {
    const missing = REQUIRED_COLUMN_KEYS.filter((k) => !keys.includes(k));
    return [...missing, ...keys];
  };

  const toggle = (key: string) => {
    if (REQUIRED_COLUMN_KEYS.includes(key)) return;
    // Append on tick so an arranged layout survives; drop in place on untick.
    onChange(selected.has(key) ? value.filter((k) => k !== key) : withRequired([...value, key]));
  };

  const toggleGroup = (group: string, on: boolean) => {
    const keys = COLUMNS.filter((c) => c.group === group).map((c) => c.key);
    if (on) onChange(withRequired([...value, ...keys.filter((k) => !selected.has(k))]));
    else onChange(withRequired(value.filter((k) => !keys.includes(k) || REQUIRED_COLUMN_KEYS.includes(k))));
  };

  // ---- ordering -------------------------------------------------------------------------------
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const onDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    const from = value.indexOf(dragKey);
    const to = value.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    move(from, to);
    setDragKey(null);
  };

  // ---- custom columns -------------------------------------------------------------------------
  function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const key = `${CUSTOM_PREFIX}${crypto.randomUUID()}`;
    onCustomChange([...custom, { key, label, kind: newKind }]);
    onChange(withRequired([...value, key])); // a column you just made should be visible
    setNewLabel("");
    setNewKind("text");
  }

  function removeCustom(key: string) {
    onCustomChange(custom.filter((c) => c.key !== key));
    onChange(value.filter((k) => k !== key));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(withRequired(ALL_COLUMN_KEYS.concat(custom.map((c) => c.key))))}>All columns</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(withRequired(QUERY_COLUMN_KEYS))}>Query fields</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(withRequired(ESSENTIAL_COLUMN_KEYS))}>Essentials</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(withRequired([]))}>Clear</Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {value.length} of {ALL_COLUMN_KEYS.length + custom.length} selected
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ---- pick ---- */}
        <div className="max-h-[46vh] space-y-4 overflow-y-auto rounded-md border border-border p-3">
          {COLUMN_GROUPS.map((group) => {
            const cols = COLUMNS.filter((c) => c.group === group);
            const on = cols.filter((c) => selected.has(c.key)).length;
            const allOn = on === cols.length;
            return (
              <div key={group}>
                <div className="mb-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group, !allOn)}
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    {group}
                  </button>
                  <span className="text-[11px] text-muted-foreground/70 tabular-nums">{on}/{cols.length}</span>
                </div>
                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {cols.map((c) => {
                    const required = REQUIRED_COLUMN_KEYS.includes(c.key);
                    return (
                      <label
                        key={c.key}
                        className={cn(
                          "flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm",
                          required ? "cursor-default opacity-60" : "cursor-pointer hover:bg-secondary",
                        )}
                      >
                        <Checkbox checked={selected.has(c.key) || required} disabled={required} onCheckedChange={() => toggle(c.key)} />
                        <span className="truncate">{flat(c.label)}</span>
                        {c.derived && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">calc</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Your own columns live in their own section so they're never confused with the
              catalogue's — and only these can be deleted. */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Custom</p>
            {custom.length === 0 && <p className="mb-2 text-xs text-muted-foreground">None yet — add one below.</p>}
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {custom.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-secondary">
                  <Checkbox checked={selected.has(c.key)} onCheckedChange={() => toggle(c.key)} />
                  <span className="truncate">{c.label}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{KIND_LABEL[c.kind]}</span>
                  <button
                    type="button"
                    aria-label={`Delete column ${c.label}`}
                    onClick={(e) => { e.preventDefault(); removeCustom(c.key); }}
                    className="shrink-0 text-muted-foreground hover:text-[#cc0000]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                placeholder="New column name…"
                aria-label="New column name"
                className="h-8 flex-1 min-w-[9rem] text-sm"
              />
              <Select value={newKind} onValueChange={(v) => setNewKind(v as CellKind)}>
                <SelectTrigger className="h-8 w-[7.5rem] text-sm" aria-label="New column type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as CellKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!newLabel.trim()}>
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </div>
        </div>

        {/* ---- order ---- */}
        <div className="flex max-h-[46vh] flex-col rounded-md border border-border">
          <p className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Layout — drag to reorder
          </p>
          <div className="flex-1 overflow-y-auto p-2">
            {ordered.length === 0 && <p className="px-1 py-4 text-center text-sm text-muted-foreground">No columns selected.</p>}
            {ordered.map((c, i) => (
              <div
                key={c.key}
                draggable
                onDragStart={() => setDragKey(c.key)}
                onDragEnd={() => setDragKey(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(c.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm border border-transparent px-1.5 py-1 text-sm",
                  dragKey === c.key ? "opacity-40" : "hover:border-border hover:bg-secondary",
                )}
              >
                <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground" />
                <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="truncate">{flat(c.label)}</span>
                {c.custom && <span className="shrink-0 text-[10px] text-muted-foreground">custom</span>}
                {c.derived && <span className="shrink-0 text-[10px] text-muted-foreground">calc</span>}
                <div className="ml-auto flex shrink-0 items-center">
                  <button type="button" aria-label={`Move ${flat(c.label)} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25">
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button type="button" aria-label={`Move ${flat(c.label)} down`} disabled={i === ordered.length - 1} onClick={() => move(i, i + 1)} className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25">
                    <ChevronDown className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Columns marked <span className="font-medium">calc</span> are computed from the others — you don&apos;t type into
        them. Unticking a column only hides it; anything already typed there is kept. Deleting a{" "}
        <span className="font-medium">custom</span> column also hides its data, but the values stay in each row.
      </p>
    </div>
  );
}
