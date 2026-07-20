// Live KPI tile for the analytics module. Optional trend delta with color cue.
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@360/ui/utils";

export function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  accent = false,
  invert = false,
}: {
  label: string;
  value: string;
  delta?: number;
  icon: LucideIcon;
  accent?: boolean;
  invert?: boolean; // when true, a downward delta is "good" (e.g. expenses)
}) {
  const up = (delta ?? 0) >= 0;
  const positive = invert ? !up : up;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border bg-card p-5 transition-shadow hover:shadow-sm",
        accent ? "border-[#cc0000]" : "border-border",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0 h-full w-1",
          accent ? "bg-[#cc0000]" : "bg-black",
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground [font-family:var(--font-heading)]">
          {label}
        </p>
        <Icon className={cn("size-4", accent ? "text-[#cc0000]" : "text-foreground")} />
      </div>
      <p className="mt-3 [font-family:var(--font-heading)] text-2xl font-bold tabular-nums">
        {value}
      </p>
      {delta !== undefined && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium",
            positive ? "text-emerald-600" : "text-[#cc0000]",
          )}
        >
          {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {Math.abs(delta)}% vs last period
        </div>
      )}
    </div>
  );
}
