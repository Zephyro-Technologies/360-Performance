// Catalogue category sidebar — an accordion. Parent categories are collapsed by
// default; clicking a parent expands/collapses its children. The parent of the
// active category auto-expands. Standalone top-level categories (no children) are
// direct filters. Selecting "All Products" or a leaf calls onSelect with the slug
// (null clears to all).
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

type Cat = { id: string; slug: string; name: string };
export interface CategoryNavGroup {
  parent: Cat;
  leaves: Cat[];
}

const item =
  "block w-full rounded-md text-left font-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none";

export function CategoryNav({
  groups,
  category,
  onSelect,
}: {
  groups: CategoryNavGroup[];
  category: string;
  onSelect: (slug: string | null) => void;
}) {
  const activeParentId = useMemo(() => {
    const g = groups.find((grp) => grp.leaves.some((l) => l.slug === category));
    return g?.parent.id ?? null;
  }, [groups, category]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (activeParentId) setExpanded((s) => (s.has(activeParentId) ? s : new Set(s).add(activeParentId)));
  }, [activeParentId]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <h4 className="mb-2 font-heading text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Category</h4>
      <nav className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`${item} px-3 py-2 text-sm font-medium ${
            category === "all" ? "bg-brand text-white" : "text-foreground hover:bg-accent"
          }`}
        >
          All Products
        </button>
        {groups.map((g) => {
          const isOpen = expanded.has(g.parent.id);
          const childActive = g.leaves.some((l) => l.slug === category);
          // Standalone top-level category (no children) — a direct filter, not an accordion.
          if (g.leaves.length === 0) {
            return (
              <button
                key={g.parent.id}
                type="button"
                onClick={() => onSelect(g.parent.slug)}
                className={`${item} mt-1.5 px-3 py-2 text-sm font-semibold uppercase tracking-wide ${
                  category === g.parent.slug ? "bg-brand text-white" : "text-foreground hover:bg-accent"
                }`}
              >
                {g.parent.name}
              </button>
            );
          }
          return (
            <div key={g.parent.id} className="mt-1.5 flex flex-col">
              <button
                type="button"
                onClick={() => toggle(g.parent.id)}
                aria-expanded={isOpen}
                className={`${item} flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold uppercase tracking-wide ${
                  childActive ? "text-brand" : "text-foreground hover:bg-accent"
                }`}
              >
                <span className="truncate">{g.parent.name}</span>
                <ChevronDown className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-zinc-200 pl-2">
                  {g.leaves.map((leaf) => (
                    <button
                      key={leaf.id}
                      type="button"
                      onClick={() => onSelect(leaf.slug)}
                      className={`${item} px-2 py-2.5 text-[13px] ${
                        category === leaf.slug
                          ? "font-medium text-brand"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {leaf.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
