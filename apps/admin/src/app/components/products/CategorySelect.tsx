// Dependent category dropdowns for the product editor: a Parent field (8 top-level
// categories) and a Sub-category field filtered to the chosen parent's children. The
// product stores the single LEAF category_id (the parent is derived from parent_id).
// Uses the same Radix Select primitive as the dialog's other dropdowns (which work in
// the modal), avoiding the Popover-in-Dialog portal issue the combobox hit.
//
// Edge case: a top-level category with NO children holds products directly (e.g. Misc
// Performance). It appears as a Parent whose only leaf is itself — picking it selects
// it as the leaf, and the Sub field shows it (disabled).
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@360/ui/select";
import type { CategoryGroup } from "../../data/catalog";

interface ParentOption {
  key: string;
  name: string;
  leaves: { id: string; name: string }[];
}

// Exported for unit tests: turn category groups into parent options. A real parent
// keeps its children as leaves; a standalone top-level leaf becomes a parent whose
// only leaf is itself.
export function toParentOptions(groups: CategoryGroup[]): ParentOption[] {
  return groups.map((g) =>
    g.parent
      ? { key: g.parent.id, name: g.parent.name, leaves: g.leaves }
      : { key: g.leaves[0]?.id ?? "", name: g.leaves[0]?.name ?? "", leaves: g.leaves },
  );
}

export function CategorySelect({
  groups,
  value,
  onChange,
}: {
  groups: CategoryGroup[];
  value: string;
  onChange: (id: string) => void;
}) {
  const parents = toParentOptions(groups);
  const parentOf = (leafId: string) => parents.find((p) => p.leaves.some((l) => l.id === leafId))?.key ?? "";
  const [parentKey, setParentKey] = useState(() => parentOf(value));

  const current = parents.find((p) => p.key === parentKey);
  const subs = current?.leaves ?? [];
  const standalone = !!current && current.leaves.length === 1 && current.leaves[0].id === current.key;

  function pickParent(key: string) {
    setParentKey(key);
    const p = parents.find((po) => po.key === key);
    // single leaf (standalone, or a parent with one child) → auto-select it; else clear
    onChange(p && p.leaves.length === 1 ? p.leaves[0].id : "");
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Select value={parentKey} onValueChange={pickParent}>
        <SelectTrigger aria-label="Parent category">
          <SelectValue placeholder="Parent category" />
        </SelectTrigger>
        <SelectContent>
          {parents.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value || ""} onValueChange={onChange} disabled={!parentKey || standalone}>
        <SelectTrigger aria-label="Sub-category">
          <SelectValue placeholder={parentKey ? (standalone ? current?.name : "Sub-category") : "Pick a parent first"} />
        </SelectTrigger>
        <SelectContent>
          {subs.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
