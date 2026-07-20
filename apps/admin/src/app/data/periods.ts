// Reporting periods for the Analytics page — the preset model behind the period picker.
//
// Pure date math on ISO "YYYY-MM-DD" strings; deliberately no Supabase import, so it unit-tests
// with no mocks. All arithmetic goes through Date.UTC + the UTC getters in analytics.ts (see the
// comment there for why): a local-midnight Date rolls back a day in negative-offset zones and the
// windows we hand to pnl_summary_between would silently shift.
//
// NOTE the calendar in PeriodPicker.tsx needs LOCAL Dates instead — react-day-picker builds and
// renders them in local time. Those adapters live in that file and must never be mixed with these.
import { businessTodayISO, iso, MONTH_NAMES } from "./analytics";

export type PresetId =
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "thisYear"
  | "allTime";

// The earliest and latest day on which anything financial happened (from the activity_days view).
export interface Bounds {
  min: string;
  max: string;
}

export interface Period {
  start: string; // ISO, inclusive
  end: string; // ISO, inclusive
  preset: PresetId | "custom";
  label: string; // short, for prose: "June 2026", "July 2026 so far"
  rangeLabel: string; // the honest dates, for the picker trigger: "1 – 17 Jul 2026"
}

export interface Preset {
  id: PresetId;
  label: string;
  resolve: (todayISO: string, bounds: Bounds | null) => { start: string; end: string; label?: string };
}

// The client runs salaries and month-end accounting off the PREVIOUS month, so that is what the
// dashboard opens on. This is a requirement, not a default-by-accident: on a sparse dataset it can
// legitimately render all zeros, and the answer to that is EmptyPeriodHint, never a rolling window.
export const DEFAULT_PRESET: PresetId = "lastMonth";

// ---- ISO helpers ------------------------------------------------------------------------------
const parse = (isoDate: string) => new Date(Date.parse(isoDate + "T00:00:00Z"));
const addDays = (isoDate: string, n: number) => {
  const d = parse(isoDate);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const monthStart = (y: number, m: number) => iso(new Date(Date.UTC(y, m, 1)));
const monthEnd = (y: number, m: number) => iso(new Date(Date.UTC(y, m + 1, 0))); // day 0 = last of m
const maxISO = (a: string, b: string) => (a > b ? a : b);
const minISO = (a: string, b: string) => (a < b ? a : b);

// Is `end` the last day of its own calendar month? Drives the " so far" suffix.
const isMonthComplete = (end: string) => end === monthEnd(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1);

// ---- labels -----------------------------------------------------------------------------------
const DAY = (isoDate: string) => String(Number(isoDate.slice(8, 10)));
const MON = (isoDate: string) => MONTH_NAMES[Number(isoDate.slice(5, 7)) - 1].slice(0, 3);
const YR = (isoDate: string) => isoDate.slice(0, 4);

// "1 – 17 Jul 2026" / "28 Jun – 17 Jul 2026" / "14 Jul 2025 – 17 Jul 2026".
// Built from the ISO parts rather than formatDate(), which parses at UTC midnight and then reads
// LOCAL getters — a day out in negative-offset zones. Don't route this through @360/lib/format.
export function rangeLabel(start: string, end: string): string {
  if (start === end) return `${DAY(start)} ${MON(start)} ${YR(start)}`;
  if (YR(start) !== YR(end)) return `${DAY(start)} ${MON(start)} ${YR(start)} – ${DAY(end)} ${MON(end)} ${YR(end)}`;
  if (MON(start) !== MON(end)) return `${DAY(start)} ${MON(start)} – ${DAY(end)} ${MON(end)} ${YR(end)}`;
  return `${DAY(start)} – ${DAY(end)} ${MON(end)} ${YR(end)}`;
}

const monthLabel = (isoDate: string) => `${MONTH_NAMES[Number(isoDate.slice(5, 7)) - 1]} ${YR(isoDate)}`;

// ---- presets ----------------------------------------------------------------------------------
// A rolling window ending today. "Last 7 days" includes today, so it starts 6 days back.
const rolling = (id: PresetId, label: string, days: number): Preset => ({
  id,
  label,
  resolve: (today) => ({ start: addDays(today, -(days - 1)), end: today }),
});

export const PRESETS: Preset[] = [
  {
    id: "lastMonth",
    label: "Last month",
    resolve: (today) => {
      const y = Number(today.slice(0, 4));
      const m = Number(today.slice(5, 7)) - 1;
      return { start: monthStart(y, m - 1), end: monthEnd(y, m - 1), label: monthLabel(monthStart(y, m - 1)) };
    },
  },
  {
    id: "thisMonth",
    label: "This month",
    resolve: (today) => {
      const y = Number(today.slice(0, 4));
      const m = Number(today.slice(5, 7)) - 1;
      const start = monthStart(y, m);
      return { start, end: today, label: `${monthLabel(start)}${isMonthComplete(today) ? "" : " so far"}` };
    },
  },
  rolling("last7", "Last 7 days", 7),
  rolling("last30", "Last 30 days", 30),
  rolling("last90", "Last 90 days", 90),
  {
    id: "thisQuarter",
    label: "This quarter",
    resolve: (today) => {
      const y = Number(today.slice(0, 4));
      const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
      const start = monthStart(y, q * 3);
      const full = monthEnd(y, q * 3 + 2);
      return { start, end: today, label: `Q${q + 1} ${y}${today >= full ? "" : " so far"}` };
    },
  },
  {
    id: "thisYear",
    label: "This year",
    resolve: (today) => {
      const y = Number(today.slice(0, 4));
      return { start: monthStart(y, 0), end: today, label: `${y}${today >= monthEnd(y, 11) ? "" : " so far"}` };
    },
  },
  {
    id: "allTime",
    label: "All time",
    // Bounded by real activity, NOT a hardcoded epoch. The old "2000-01-01" floor is what made the
    // chart render ~1200 empty day-buckets ending in 2003 and never reach the data. `end` takes the
    // max because a refund with deduction_cycle='next' posts its effective day into a future month.
    resolve: (today, bounds) =>
      bounds
        ? { start: bounds.min, end: maxISO(bounds.max, today), label: "All time" }
        : { start: today, end: today, label: "All time" },
  },
];

const byId = new Map(PRESETS.map((p) => [p.id, p]));

export function resolvePreset(id: PresetId, todayISO: string, bounds: Bounds | null): Period {
  const preset = byId.get(id) ?? byId.get(DEFAULT_PRESET)!;
  const r = preset.resolve(todayISO, bounds);
  return { start: r.start, end: r.end, preset: preset.id, label: r.label ?? preset.label, rangeLabel: rangeLabel(r.start, r.end) };
}

export function customPeriod(start: string, end: string): Period {
  return { start, end, preset: "custom", label: rangeLabel(start, end), rangeLabel: rangeLabel(start, end) };
}

export function defaultPeriod(todayISO: string, bounds: Bounds | null): Period {
  return resolvePreset(DEFAULT_PRESET, todayISO, bounds);
}

// The whole calendar month containing `on` — what EmptyPeriodHint jumps to. Clamped at today so
// jumping into the current month doesn't ask the P&L for days that haven't happened yet.
export function monthPeriod(on: string, today: string): Period {
  const y = Number(on.slice(0, 4));
  const m = Number(on.slice(5, 7)) - 1;
  const start = monthStart(y, m);
  const end = minISO(monthEnd(y, m), maxISO(today, on));
  return {
    start,
    end,
    preset: "custom",
    label: `${monthLabel(start)}${isMonthComplete(end) ? "" : " so far"}`,
    rangeLabel: rangeLabel(start, end),
  };
}

export const todayISO = businessTodayISO;

// ---- chart bucketing --------------------------------------------------------------------------
export type Grain = "day" | "week" | "month";
export const grainFor = (start: string, end: string): Grain => {
  const span = (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000 + 1;
  return span <= 92 ? "day" : span <= 730 ? "week" : "month";
};

// ISO Monday of the week containing `d`.
function weekStart(isoDate: string): string {
  const d = parse(isoDate);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return iso(d);
}

const bucketKey = (isoDate: string, grain: Grain) =>
  grain === "day" ? isoDate : grain === "week" ? weekStart(isoDate) : isoDate.slice(0, 7) + "-01";

const bucketLabel = (key: string, grain: Grain) =>
  grain === "month" ? `${MON(key)} ${key.slice(2, 4)}` : `${DAY(key)} ${MON(key)}`;

export interface DailyLike {
  day: string;
  revenue_pkr: number | string;
}

// Fold the SPARSE analytics_daily rows into buckets, then emit the bucket sequence. Never walk one
// day at a time: that's what forced the old `guard < 1200` cap, which silently truncated any window
// longer than ~3.3 years to its first 1200 days.
export function buildChartSeries(daily: DailyLike[], start: string, end: string): { date: string; revenue: number }[] {
  if (end < start) return [];
  const grain = grainFor(start, end);

  const totals = new Map<string, number>();
  for (const d of daily) {
    if (d.day < start || d.day > end) continue;
    const k = bucketKey(d.day, grain);
    totals.set(k, (totals.get(k) ?? 0) + Number(d.revenue_pkr ?? 0));
  }

  const out: { date: string; revenue: number }[] = [];
  let cursor = bucketKey(start, grain);
  const lastKey = bucketKey(end, grain);
  // Bounded by construction: the cursor always advances by a whole bucket, so worst case is
  // (span / bucket size) iterations — ~120 for a decade of months.
  while (cursor <= lastKey) {
    out.push({ date: bucketLabel(cursor, grain), revenue: totals.get(cursor) ?? 0 });
    if (grain === "day") cursor = addDays(cursor, 1);
    else if (grain === "week") cursor = addDays(cursor, 7);
    else {
      const y = Number(cursor.slice(0, 4));
      const m = Number(cursor.slice(5, 7)) - 1;
      cursor = monthStart(y, m + 1);
    }
  }
  return out;
}

export { maxISO, minISO };
