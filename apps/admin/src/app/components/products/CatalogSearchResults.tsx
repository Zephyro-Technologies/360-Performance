// Cross-tab search results for the Catalogue. Appears above the tab content whenever a search term
// is active, so matches outside the tab you're on are still visible. Clicking a row switches to the
// tab that owns it — the term stays, so the item is right there in the tab's own filtered view.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatPKR } from "@360/lib/format";
import { cn } from "@360/ui/utils";
import { groupHits, TAB_LABEL, type CatalogHit, type CatalogTab } from "./catalogSearch";

const PER_GROUP = 5; // rows shown per tab before "+N more"; the full list lives in the tab itself

export function CatalogSearchResults({
  term,
  hits,
  activeTab,
  onJump,
}: {
  term: string;
  hits: CatalogHit[];
  activeTab: CatalogTab;
  onJump: (tab: CatalogTab) => void;
}) {
  const [open, setOpen] = useState(true);
  const groups = groupHits(hits);

  if (!term.trim()) return null;

  if (hits.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Nothing in the catalogue matches &ldquo;{term.trim()}&rdquo; — searched name, SKU, vendor, category, brand and OEM #.
      </div>
    );
  }

  // The whole point of the panel: say up front whether there is anything outside the current tab.
  const elsewhere = hits.filter((h) => h.tab !== activeTab).length;

  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="text-sm font-medium">
          {hits.length} {hits.length === 1 ? "match" : "matches"} across the catalogue
        </span>
        <span className="text-xs text-muted-foreground">
          {elsewhere > 0 ? `· ${elsewhere} outside ${TAB_LABEL[activeTab]}` : `· all in ${TAB_LABEL[activeTab]}`}
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          {groups.map((g) => (
            <div key={g.tab} className="border-b border-border/60 last:border-b-0">
              <div className="flex items-center gap-2 bg-muted/50 px-4 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {TAB_LABEL[g.tab]}
                </span>
                <span className="text-[11px] text-muted-foreground/70 tabular-nums">{g.hits.length}</span>
                {g.tab !== activeTab && (
                  <button
                    type="button"
                    onClick={() => onJump(g.tab)}
                    className="ml-auto text-xs font-medium text-[#cc0000] hover:underline"
                  >
                    Go to {TAB_LABEL[g.tab]}
                  </button>
                )}
              </div>
              {g.hits.slice(0, PER_GROUP).map((h) => (
                <button
                  key={`${h.tab}-${h.id}`}
                  type="button"
                  onClick={() => onJump(h.tab)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-secondary"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                  {h.ref && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{h.ref}</span>}
                  {/* Why this row matched — useful when the term isn't in the name. */}
                  {h.matchedOn !== "name" && (
                    <span className="hidden shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                      {h.matchedOn}
                    </span>
                  )}
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {h.price == null ? "—" : formatPKR(h.price)}
                  </span>
                </button>
              ))}
              {g.hits.length > PER_GROUP && (
                <button
                  type="button"
                  onClick={() => onJump(g.tab)}
                  className="w-full px-4 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
                >
                  +{g.hits.length - PER_GROUP} more in {TAB_LABEL[g.tab]}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
