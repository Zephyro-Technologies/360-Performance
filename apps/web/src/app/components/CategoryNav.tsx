// Catalogue category sidebar — an accordion. Parent categories are collapsed by
// default; clicking a parent expands/collapses its children. The parent auto-expands
// when the active category is that parent OR one of its leaves. Standalone top-level
// categories (no children) are direct filters. Selecting "All Products" or a leaf calls
// onSelect with the slug (null clears to all).
//
// Selection styling is deliberately uniform: every ACTUAL filter (All Products, a leaf,
// a standalone, or a parent you've landed on via the mega-menu) gets the same solid brand
// pill. An EXPANDED parent gets a lighter red-text treatment — a weaker state that marks the
// open section without claiming to be the selected filter itself. A COLLAPSED parent stays
// neutral even when one of its (hidden) children is the active filter.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

type Cat = { id: string; slug: string; name: string };
export interface CategoryNavGroup {
  parent: Cat;
  leaves: Cat[];
}

const BASE =
  "w-full rounded-md text-left font-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none";
// The ONE active-filter treatment, shared by All Products / leaf / standalone / parent-self.
const ACTIVE = "bg-brand text-white";
const IDLE = "text-foreground hover:bg-accent";

export function CategoryNav({
  groups,
  category,
  onSelect,
}: {
  groups: CategoryNavGroup[];
  category: string;
  onSelect: (slug: string | null) => void;
}) {
  // The group to auto-expand: the one you're inside, whether via its parent slug or a leaf.
  const activeParentId = useMemo(() => {
    const g = groups.find(
      (grp) => grp.parent.slug === category || grp.leaves.some((l) => l.slug === category),
    );
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
    <nav className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-current={category === "all" ? "true" : undefined}
          className={`${BASE} px-3 py-2 text-sm font-semibold ${category === "all" ? ACTIVE : IDLE}`}
        >
          All Products
        </button>

        {groups.map((g) => {
          const isOpen = expanded.has(g.parent.id);
          const parentSelf = category === g.parent.slug;

          // Standalone top-level category (no children) — a direct filter, not an accordion.
          if (g.leaves.length === 0) {
            return (
              <button
                key={g.parent.id}
                type="button"
                onClick={() => onSelect(g.parent.slug)}
                aria-current={parentSelf ? "true" : undefined}
                className={`${BASE} px-3 py-2 text-sm font-semibold uppercase tracking-wide ${
                  parentSelf ? ACTIVE : IDLE
                }`}
              >
                {g.parent.name}
              </button>
            );
          }

          return (
            <div key={g.parent.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggle(g.parent.id)}
                aria-expanded={isOpen}
                aria-current={parentSelf ? "true" : undefined}
                className={`${BASE} flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold uppercase tracking-wide ${
                  parentSelf ? ACTIVE : isOpen ? "text-brand hover:bg-accent" : IDLE
                }`}
              >
                <span className="truncate">{g.parent.name}</span>
                <ChevronDown
                  className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${
                    isOpen ? "rotate-180" : ""
                  } ${parentSelf ? "text-white/90" : isOpen ? "text-brand" : "text-zinc-400"}`}
                />
              </button>
              {isOpen && (
                <div className="ml-3 mt-1 flex flex-col gap-1 border-l border-zinc-200 pl-3">
                  {g.leaves.map((leaf) => {
                    const active = category === leaf.slug;
                    return (
                      <button
                        key={leaf.id}
                        type="button"
                        onClick={() => onSelect(leaf.slug)}
                        aria-current={active ? "true" : undefined}
                        className={`${BASE} px-3 py-2 text-[13px] ${
                          active
                            ? `${ACTIVE} font-medium`
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {leaf.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </nav>
  );
}
