// The Analytics reporting period, sourced from the URL (?from=YYYY-MM-DD&to=YYYY-MM-DD).
//
// The URL is the single source of truth — there is no layout/context copy. That's what makes the
// period survive a refresh, makes a range shareable, and keeps /insights/* drill-downs on the same
// window as the dashboard that linked to them (Analytics appends `periodSearch` to those hrefs).
//
// Param handling follows the house pattern from Invoices.tsx: validate-with-fallback on read, copy
// into a fresh URLSearchParams so sibling params survive, replace: true so the picker doesn't spam
// history, and omit the params entirely when the period is the default.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useActivityDays } from "../data/analytics";
import {
  DEFAULT_PRESET,
  PRESETS,
  customPeriod,
  resolvePreset,
  type Bounds,
  type Period,
} from "../data/periods";
import { useToday } from "./useToday";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const valid = (v: string | null): v is string => !!v && ISO_RE.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));

export interface PeriodParams {
  period: Period;
  setPeriod: (p: Period) => void;
  bounds: Bounds | null;
  isActivityLoading: boolean;
  hasActivityIn: (start: string, end: string) => boolean;
  periodSearch: string; // "" on the default, else "?from=…&to=…"
}

export function usePeriodParams(): PeriodParams {
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const activityQ = useActivityDays();

  const days = activityQ.data;
  const bounds = useMemo<Bounds | null>(
    () => (days && days.length ? { min: days[0], max: days[days.length - 1] } : null),
    [days],
  );

  // days is ordered by the query; a window has activity iff any day falls inside it.
  const hasActivityIn = useCallback(
    (start: string, end: string) => (days ?? []).some((d) => d >= start && d <= end),
    [days],
  );

  const fallback = useMemo(() => resolvePreset(DEFAULT_PRESET, today, bounds), [today, bounds]);

  const period = useMemo<Period>(() => {
    const from = params.get("from");
    const to = params.get("to");
    if (!valid(from) || !valid(to) || from > to) return fallback;
    // A range that happens to equal a preset's window adopts that preset, so a shared link lands
    // with the right row selected in the rail rather than reading as an arbitrary custom range.
    const match = PRESETS.find((p) => {
      const r = p.resolve(today, bounds);
      return r.start === from && r.end === to;
    });
    return match ? resolvePreset(match.id, today, bounds) : customPeriod(from, to);
  }, [params, today, bounds, fallback]);

  const isDefault = period.start === fallback.start && period.end === fallback.end;

  const setPeriod = useCallback(
    (p: Period) => {
      const next = new URLSearchParams(params);
      if (p.start === fallback.start && p.end === fallback.end) {
        next.delete("from");
        next.delete("to");
      } else {
        next.set("from", p.start);
        next.set("to", p.end);
      }
      setParams(next, { replace: true });
    },
    [params, setParams, fallback],
  );

  const periodSearch = isDefault ? "" : `?from=${period.start}&to=${period.end}`;

  return { period, setPeriod, bounds, isActivityLoading: activityQ.isLoading, hasActivityIn, periodSearch };
}
