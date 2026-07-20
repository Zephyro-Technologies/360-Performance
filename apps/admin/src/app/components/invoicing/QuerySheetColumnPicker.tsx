// Tick-box column selector for a query sheet — used both when creating a sheet and when changing
// an existing sheet's columns. Grouped by the catalogue's sections, with a whole-section toggle
// and All / Essentials presets.
import { useMemo } from "react";
import { Checkbox } from "@360/ui/checkbox";
import { Button } from "@360/ui/button";
import { cn } from "@360/ui/utils";
import {
  COLUMNS,
  COLUMN_GROUPS,
  ALL_COLUMN_KEYS,
  ESSENTIAL_COLUMN_KEYS,
  REQUIRED_COLUMN_KEYS,
} from "./querySheetColumns";

// The header labels carry "\n" for the two-line table header; flatten it for the picker list.
const flat = (label: string) => label.replace(/\n/g, " ");

export function QuerySheetColumnPicker({ value, onChange }: { value: string[]; onChange: (keys: string[]) => void }) {
  const selected = useMemo(() => new Set(value), [value]);

  // Selection is stored in declaration order so the sheet always reads like the catalogue,
  // regardless of the order the boxes were ticked in.
  const setKeys = (keys: Set<string>) => {
    for (const k of REQUIRED_COLUMN_KEYS) keys.add(k);
    onChange(ALL_COLUMN_KEYS.filter((k) => keys.has(k)));
  };

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setKeys(next);
  };

  const toggleGroup = (group: string, on: boolean) => {
    const next = new Set(selected);
    for (const c of COLUMNS.filter((c) => c.group === group)) {
      if (on) next.add(c.key);
      else next.delete(c.key);
    }
    setKeys(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(ALL_COLUMN_KEYS)}>All columns</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setKeys(new Set(ESSENTIAL_COLUMN_KEYS))}>Essentials</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setKeys(new Set())}>Clear</Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {value.length} of {ALL_COLUMN_KEYS.length} selected
        </span>
      </div>

      <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-md border border-border p-3">
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
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
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
                      <Checkbox
                        checked={selected.has(c.key) || required}
                        disabled={required}
                        onCheckedChange={() => toggle(c.key)}
                      />
                      <span className="truncate">{flat(c.label)}</span>
                      {c.derived && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">calc</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Columns marked <span className="font-medium">calc</span> are computed from the others — you don&apos;t type into
        them. Unticking a column only hides it; anything already typed there is kept.
      </p>
    </div>
  );
}
