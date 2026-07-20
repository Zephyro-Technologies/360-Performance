// The Analytics reporting-period control: a presets rail + a real custom-range calendar.
//
// Data-aware in two ways: presets whose window contains no activity are marked "(0)", and the
// calendar is clamped to the span of real data, so there's no wandering into empty decades.
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@360/ui/button";
import { Calendar } from "@360/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@360/ui/popover";
import { useIsMobile } from "@360/ui/use-mobile";
import { cn } from "@360/ui/utils";
import { PRESETS, customPeriod, maxISO, resolvePreset, type Bounds, type Period } from "../../data/periods";

// react-day-picker's own DateRange, structurally. It's a dependency of @360/ui, not of this app, so
// importing the type here wouldn't resolve — and it isn't worth a package.json entry for one shape.
// `from` is a REQUIRED key that may hold undefined (not an optional key); the two aren't assignable
// to each other, and getting it wrong only shows up where `selected` is passed to the Calendar.
type DayRange = { from: Date | undefined; to?: Date | undefined } | undefined;

// LOCAL-time adapters, for the calendar ONLY.
//
// react-day-picker builds and renders Date objects in local time, while every period string in this
// app is UTC-anchored (see the comment atop data/analytics.ts). Feeding a UTC-midnight Date to the
// day picker highlights the PREVIOUS day in any negative-offset zone, and round-tripping it back
// through iso() then persists that shift. So the two never mix: iso()/businessToday() stay on the
// preset-math side, and these two stay here. Do not export them.
const isoToLocalDate = (v: string) => new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
const localDateToIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function PeriodPicker({
  period,
  onChange,
  today,
  bounds,
  hasActivityIn,
}: {
  period: Period;
  onChange: (p: Period) => void;
  today: string;
  bounds: Bounds | null;
  hasActivityIn: (start: string, end: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  // The in-progress range. Undefined means "not picking yet", so the calendar shows the period
  // currently in force; the first click replaces it with a fresh, half-open range.
  const [draft, setDraft] = useState<DayRange>(undefined);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) setDraft(undefined); // every visit starts a new selection, not a continuation
  }, [open]);

  const commit = (p: Period) => {
    onChange(p);
    setOpen(false);
  };

  // Two clicks = one range. The draft is what makes that true: day-picker's addToRange, handed an
  // already-complete range, treats a single click as "drag the end" and returns another complete
  // range — which would apply a half-intended window and close the popover on click one. So when
  // the draft is complete (or absent), a click starts over from that day instead.
  const onSelectRange = (sel: DayRange, clickedDay: Date) => {
    const startOver = !draft || (!!draft.from && !!draft.to);
    const next: DayRange = startOver ? { from: clickedDay, to: undefined } : sel;
    setDraft(next);
    if (next?.from && next.to) commit(customPeriod(localDateToIso(next.from), localDateToIso(next.to)));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-auto w-full justify-start gap-2 py-1.5 sm:w-auto" aria-label="Reporting period">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm font-medium">{period.label}</span>
            {/* The real dates, always on screen — a partial period can't masquerade as a whole one. */}
            <span className="text-[11px] font-normal text-muted-foreground">{period.rangeLabel}</span>
          </span>
        </Button>
      </PopoverTrigger>
      {/* w-auto p-0 is required: PopoverContent hard-codes w-72 p-4, which crops a two-month grid. */}
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex shrink-0 flex-col gap-0.5 border-b border-border p-2 sm:border-b-0 sm:border-r">
            {PRESETS.map((p) => {
              const r = p.resolve(today, bounds);
              const empty = !hasActivityIn(r.start, r.end);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={period.preset === p.id}
                  onClick={() => commit(resolvePreset(p.id, today, bounds))}
                  className={cn(
                    "flex items-center justify-between gap-4 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-secondary",
                    period.preset === p.id && "bg-secondary font-medium",
                    empty && "text-muted-foreground",
                  )}
                >
                  {p.label}
                  {/* Not disabled: confirming a period is empty is a legitimate thing to want, and a
                      disabled control can't tell you why it's dimmed. */}
                  {empty && <span className="text-[11px] tabular-nums text-muted-foreground/70">(0)</span>}
                </button>
              );
            })}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={isMobile ? 1 : 2}
            defaultMonth={isoToLocalDate(period.end)}
            selected={draft ?? { from: isoToLocalDate(period.start), to: isoToLocalDate(period.end) }}
            onSelect={onSelectRange}
            fromDate={bounds ? isoToLocalDate(bounds.min) : undefined}
            toDate={isoToLocalDate(bounds ? maxISO(bounds.max, today) : today)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
