// Catalogue toolbar control for low-stock highlighting: a toggle plus the house default reorder
// point. Per-product overrides are edited on the product itself — this only sets the fallback that
// every non-overridden product follows.
//
// The toggle is a view preference, so it lives in localStorage rather than the DB: it's per-operator
// and shouldn't need an admin write.
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@360/ui/utils";
import { Button } from "@360/ui/button";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@360/ui/popover";
import { useLowStockDefault, useUpdateLowStockDefault } from "../../data/settings";

const STORAGE_KEY = "catalogue.highlightLowStock";

export function useHighlightLowStock() {
  const [on, setOn] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(STORAGE_KEY) !== "0"; // default ON — it's a warning, not decoration
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {
      /* private mode / storage disabled — the toggle just won't persist */
    }
  }, [on]);
  return [on, setOn] as const;
}

export function LowStockControl({
  on,
  onToggle,
  canManage,
  lowCount,
}: {
  on: boolean;
  onToggle: (next: boolean) => void;
  canManage: boolean;
  lowCount: number;
}) {
  const defaultQ = useLowStockDefault();
  const update = useUpdateLowStockDefault();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  const current = defaultQ.data ?? 3;

  async function save() {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(n) || n < 0) {
      toast.error("Enter a whole number of units, 0 or more.");
      return;
    }
    try {
      await update.mutateAsync(n);
      toast.success(`Low-stock default set to ${n}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the default");
    }
  }

  return (
    <div className="flex items-center rounded-md border border-border">
      <Button
        variant={on ? "default" : "ghost"}
        size="sm"
        className="rounded-r-none"
        aria-pressed={on}
        onClick={() => onToggle(!on)}
        title="Highlight products at or below their reorder point"
      >
        <TriangleAlert className="size-4" />
        Low stock
        {on && lowCount > 0 && (
          <span className="ml-1 rounded-full bg-background/25 px-1.5 text-xs tabular-nums">{lowCount}</span>
        )}
      </Button>

      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setDraft(String(current));
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-l-none border-l border-border px-2" aria-label="Low-stock settings">
            ⚙
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3">
          <div>
            <p className="text-sm font-medium">Low-stock threshold</p>
            <p className="text-xs text-muted-foreground">
              A product is flagged when its on-hand quantity is at or below this number.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="low-stock-default">Catalogue default (units)</Label>
            <div className="flex gap-2">
              <Input
                id="low-stock-default"
                type="number"
                min={0}
                step={1}
                value={draft}
                disabled={!canManage}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                className="w-24"
              />
              {canManage && (
                <Button size="sm" onClick={save} disabled={update.isPending || draft === String(current)}>
                  {update.isPending ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </div>

          <p className={cn("text-xs", canManage ? "text-muted-foreground" : "text-amber-700")}>
            {canManage
              ? "Applies to every product that doesn't set its own. To override one product, open it and set its Low-stock threshold."
              : "Only an admin can change the catalogue default."}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
