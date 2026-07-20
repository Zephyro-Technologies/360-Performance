// Reusable click-to-sort for the dashboard's data tables. `useTableSort` sorts a flat row
// array by a chosen column; `SortHead` is a drop-in <TableHead> that toggles it on click and
// shows the direction. Keep sorting purely client-side (the arrays are already loaded).
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@360/ui/table";
import { cn } from "@360/ui/utils";

export type SortDir = "asc" | "desc";
export type SortAccessors<T> = Record<string, (row: T) => string | number | null | undefined>;

export interface TableSort<T> {
  sorted: T[];
  sortKey: string;
  dir: SortDir;
  toggle: (key: string) => void;
}

export function useTableSort<T>(
  rows: T[],
  accessors: SortAccessors<T>,
  initialKey: string,
  initialDir: SortDir = "asc",
): TableSort<T> {
  const [sortKey, setSortKey] = useState(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    const acc = accessors[sortKey];
    if (!acc) return rows;
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls/blanks always last
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * factor;
    });
    // accessors is defined inline per render; intentionally not a dep (its logic is stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, dir]);

  function toggle(key: string) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
  }

  return { sorted, sortKey, dir, toggle };
}

// A clickable sortable column header. Pass the same `sort` object returned by useTableSort.
export function SortHead<T>({
  label,
  sortKey,
  sort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: TableSort<T>;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const active = sort.sortKey === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  const justify = align === "right" ? "flex w-full justify-end" : align === "center" ? "flex w-full justify-center" : "inline-flex";
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => sort.toggle(sortKey)}
        aria-label={`Sort by ${label}`}
        className={cn(justify, "select-none items-center gap-1 transition-opacity hover:opacity-80")}
      >
        {label}
        <Icon className={cn("size-3.5 shrink-0", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  );
}
