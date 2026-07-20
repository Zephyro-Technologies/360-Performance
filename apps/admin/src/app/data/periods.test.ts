// Pure date math — no mocks, no DOM. The highest-value tests in the picker rebuild live here.
import { test, expect } from "vitest";
import {
  DEFAULT_PRESET,
  PRESETS,
  buildChartSeries,
  customPeriod,
  grainFor,
  monthPeriod,
  rangeLabel,
  resolvePreset,
  type Bounds,
} from "./periods";

const BOUNDS: Bounds = { min: "2026-07-14", max: "2026-07-16" };

// ---- the client requirement --------------------------------------------------------------------
// The dashboard MUST open on the previous COMPLETE calendar month: the client runs salaries and
// month-end accounting off it. On a sparse dataset this legitimately renders zeros — that is not a
// bug to fix by defaulting to a rolling window. If this test fails, read the memory note before
// "fixing" it.
test("the default period is the previous COMPLETE calendar month", () => {
  expect(DEFAULT_PRESET).toBe("lastMonth");
  const p = resolvePreset(DEFAULT_PRESET, "2026-07-17", BOUNDS);
  expect(p.start).toBe("2026-06-01");
  expect(p.end).toBe("2026-06-30"); // the WHOLE month, never clipped to today
  expect(p.label).toBe("June 2026");
});

test("the default period holds across a year boundary", () => {
  const p = resolvePreset(DEFAULT_PRESET, "2026-01-09", BOUNDS);
  expect(p.start).toBe("2025-12-01");
  expect(p.end).toBe("2025-12-31");
  expect(p.label).toBe("December 2025");
});

test("the default is complete, so it never reads 'so far'", () => {
  for (const today of ["2026-07-17", "2026-03-01", "2026-12-31", "2026-01-01"]) {
    expect(resolvePreset(DEFAULT_PRESET, today, BOUNDS).label).not.toMatch(/so far/);
  }
});

// ---- partial periods are labelled honestly -----------------------------------------------------
test("a partial period says 'so far'; a complete one does not", () => {
  expect(resolvePreset("thisMonth", "2026-07-17", BOUNDS).label).toBe("July 2026 so far");
  expect(resolvePreset("thisMonth", "2026-07-31", BOUNDS).label).toBe("July 2026"); // month ran out
  expect(resolvePreset("thisQuarter", "2026-07-17", BOUNDS).label).toBe("Q3 2026 so far");
  expect(resolvePreset("thisQuarter", "2026-09-30", BOUNDS).label).toBe("Q3 2026");
  expect(resolvePreset("thisYear", "2026-07-17", BOUNDS).label).toBe("2026 so far");
  expect(resolvePreset("thisYear", "2026-12-31", BOUNDS).label).toBe("2026");
});

test("quarter boundaries land on the right months", () => {
  expect(resolvePreset("thisQuarter", "2026-07-17", BOUNDS).start).toBe("2026-07-01"); // Q3
  expect(resolvePreset("thisQuarter", "2026-01-05", BOUNDS).start).toBe("2026-01-01"); // Q1
  expect(resolvePreset("thisQuarter", "2026-06-30", BOUNDS).start).toBe("2026-04-01"); // Q2
  expect(resolvePreset("thisQuarter", "2026-12-01", BOUNDS).start).toBe("2026-10-01"); // Q4
});

// ---- all-time is bounded by real data, not an epoch ---------------------------------------------
test("all time starts at the first day of real activity, not a hardcoded epoch", () => {
  const p = resolvePreset("allTime", "2026-07-17", BOUNDS);
  expect(p.start).toBe("2026-07-14");
  expect(p.start).not.toBe("2000-01-01"); // the old hardcode that made the chart render empty
});

test("all time survives an empty database", () => {
  const p = resolvePreset("allTime", "2026-07-17", null);
  expect(p.start).toBe("2026-07-17");
  expect(p.end).toBe("2026-07-17");
});

test("all time extends past today when activity is dated into the future", () => {
  // A refund with deduction_cycle='next' posts its effective day into the following month.
  const p = resolvePreset("allTime", "2026-07-17", { min: "2026-07-14", max: "2026-08-01" });
  expect(p.end).toBe("2026-08-01");
});

// ---- rolling windows ---------------------------------------------------------------------------
test("rolling windows are inclusive of today", () => {
  expect(resolvePreset("last7", "2026-07-17", BOUNDS)).toMatchObject({ start: "2026-07-11", end: "2026-07-17" });
  expect(resolvePreset("last30", "2026-07-17", BOUNDS)).toMatchObject({ start: "2026-06-18", end: "2026-07-17" });
  expect(resolvePreset("last90", "2026-07-17", BOUNDS)).toMatchObject({ start: "2026-04-19", end: "2026-07-17" });
});

// ---- labels ------------------------------------------------------------------------------------
test("rangeLabel collapses the repeated parts of a range", () => {
  expect(rangeLabel("2026-07-01", "2026-07-17")).toBe("1 – 17 Jul 2026");
  expect(rangeLabel("2026-06-28", "2026-07-17")).toBe("28 Jun – 17 Jul 2026");
  expect(rangeLabel("2025-07-14", "2026-07-17")).toBe("14 Jul 2025 – 17 Jul 2026");
  expect(rangeLabel("2026-07-14", "2026-07-14")).toBe("14 Jul 2026");
});

test("customPeriod is tagged custom and labelled with its dates", () => {
  const p = customPeriod("2026-07-14", "2026-07-16");
  expect(p.preset).toBe("custom");
  expect(p.label).toBe("14 – 16 Jul 2026");
});

test("monthPeriod wraps the whole month, clipped at today for the current one", () => {
  expect(monthPeriod("2026-07-16", "2026-07-17")).toMatchObject({ start: "2026-07-01", end: "2026-07-17", label: "July 2026 so far" });
  expect(monthPeriod("2026-06-10", "2026-07-17")).toMatchObject({ start: "2026-06-01", end: "2026-06-30", label: "June 2026" });
});

test("an unknown preset id falls back to the default rather than throwing", () => {
  expect(resolvePreset("nope" as never, "2026-07-17", BOUNDS).preset).toBe(DEFAULT_PRESET);
});

test("every preset resolves to a non-inverted window", () => {
  for (const p of PRESETS) {
    const r = p.resolve("2026-07-17", BOUNDS);
    expect(r.start <= r.end).toBe(true);
  }
});

// ---- chart bucketing ---------------------------------------------------------------------------
test("grain widens with the span", () => {
  expect(grainFor("2026-07-01", "2026-07-17")).toBe("day");
  expect(grainFor("2026-01-01", "2026-12-31")).toBe("week");
  expect(grainFor("2016-01-01", "2026-07-17")).toBe("month");
});

// The direct regression for the blank all-time chart: the old code walked one day at a time behind
// a `guard < 1200` cap, so a 10-year window rendered 1200 empty buckets and stopped ~7 years short
// of the data. Both halves matter — bounded AND actually reaching the rows.
test("a decade-wide chart stays small and still reaches the data", () => {
  const series = buildChartSeries([{ day: "2026-07-14", revenue_pkr: 559700 }], "2016-01-01", "2026-07-17");
  expect(series.length).toBeLessThanOrEqual(130);
  expect(series.some((p) => p.revenue === 559700)).toBe(true);
});

test("a day-grain chart emits every day in the window, zero-filling the gaps", () => {
  const series = buildChartSeries([{ day: "2026-07-02", revenue_pkr: 100 }], "2026-07-01", "2026-07-03");
  expect(series).toEqual([
    { date: "1 Jul", revenue: 0 },
    { date: "2 Jul", revenue: 100 },
    { date: "3 Jul", revenue: 0 },
  ]);
});

test("chart rows outside the window are ignored, and same-bucket rows sum", () => {
  const series = buildChartSeries(
    [
      { day: "2026-06-30", revenue_pkr: 999 }, // before
      { day: "2026-07-01", revenue_pkr: 10 },
      { day: "2026-07-01", revenue_pkr: 5 },
      { day: "2026-07-02", revenue_pkr: 999 }, // after
    ],
    "2026-07-01",
    "2026-07-01",
  );
  expect(series).toEqual([{ date: "1 Jul", revenue: 15 }]);
});

test("an inverted window yields no series rather than looping", () => {
  expect(buildChartSeries([], "2026-07-17", "2026-07-01")).toEqual([]);
});
