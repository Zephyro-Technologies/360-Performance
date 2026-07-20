// Shown when the selected reporting period contains no financial activity at all.
//
// This carries real weight: the dashboard is REQUIRED to open on the previous calendar month (the
// client runs salaries off it), and on a young or quiet dataset that month can legitimately be
// empty — every card reads zero and the page looks broken. Rather than silently moving the default
// to somewhere with numbers, which would defeat the requirement, say plainly that the period is
// empty and offer one click to the month where the data actually is.
import { ArrowRight } from "lucide-react";
import { monthPeriod, type Bounds, type Period } from "../../data/periods";

export function EmptyPeriodHint({
  period,
  bounds,
  isLoading,
  hasActivityIn,
  onJump,
  today,
}: {
  period: Period;
  bounds: Bounds | null;
  isLoading: boolean;
  hasActivityIn: (start: string, end: string) => boolean;
  onJump: (p: Period) => void;
  today: string;
}) {
  // Stay silent until we actually know: a flash of "no activity" while the view loads would be a
  // lie, and with no activity anywhere there's nowhere to jump to.
  if (isLoading || !bounds) return null;
  if (hasActivityIn(period.start, period.end)) return null;

  const target = monthPeriod(bounds.max, today);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-secondary px-3 py-2 text-sm">
      <span className="text-muted-foreground">No activity in {period.label}.</span>
      <button
        type="button"
        onClick={() => onJump(target)}
        className="inline-flex items-center gap-1 font-medium text-[#cc0000] underline-offset-2 hover:underline"
      >
        Jump to {target.label} <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}
