import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeriodPicker } from "./PeriodPicker";
import { EmptyPeriodHint } from "./EmptyPeriodHint";
import { resolvePreset, type Bounds } from "../../data/periods";

afterEach(cleanup);

const TODAY = "2026-07-17";
const BOUNDS: Bounds = { min: "2026-07-14", max: "2026-07-16" };
const ACTIVE = new Set(["2026-07-14", "2026-07-15", "2026-07-16"]);
const hasActivityIn = (s: string, e: string) => [...ACTIVE].some((d) => d >= s && d <= e);

const DEFAULT_PERIOD = resolvePreset("lastMonth", TODAY, BOUNDS);

function renderPicker(onChange = vi.fn(), period = DEFAULT_PERIOD) {
  render(<PeriodPicker period={period} onChange={onChange} today={TODAY} bounds={BOUNDS} hasActivityIn={hasActivityIn} />);
  return onChange;
}

// react-day-picker v9/v10 renders each day as a <button> inside <td role="gridcell" data-day="…">,
// and the button's accessible name is the full localized date (not the bare number). So the disabled
// state and the click target both live on the inner button — reach it by the cell's data-day.
const dayButton = (iso: string) => {
  const cell = document.querySelector<HTMLElement>(`[data-day="${iso}"]`);
  if (!cell) throw new Error(`no calendar cell for ${iso}`);
  return within(cell).getByRole("button");
};

test("the trigger shows the real dates, not just a month name", async () => {
  renderPicker();
  const trigger = screen.getByRole("button", { name: /reporting period/i });
  expect(within(trigger).getByText("June 2026")).toBeTruthy();
  // The honest range is always on screen, so a partial period can't pass as a whole one.
  expect(within(trigger).getByText("1 – 30 Jun 2026")).toBeTruthy();
});

test("opening the picker lists every preset, and marks the empty ones without disabling them", async () => {
  // Radix Popover needs the pointer-capture polyfills in test-setup.ts.
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  renderPicker();
  await user.click(screen.getByRole("button", { name: /reporting period/i }));

  for (const label of ["Last month", "This month", "Last 7 days", "Last 30 days", "Last 90 days", "This quarter", "This year", "All time"]) {
    expect(await screen.findByRole("button", { name: new RegExp(`^${label}`) })).toBeTruthy();
  }

  // June has no activity on this data — the required default lands on an empty month, so it must
  // say so rather than look like a broken dashboard.
  const lastMonth = screen.getByRole("button", { name: /^Last month/ });
  expect(within(lastMonth).getByText("(0)")).toBeTruthy();
  expect(lastMonth.hasAttribute("disabled")).toBe(false); // dimmed, never blocked

  // July does have activity, so "This month" carries no marker.
  expect(within(screen.getByRole("button", { name: /^This month/ })).queryByText("(0)")).toBeNull();
});

test("the active preset is marked pressed", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  renderPicker();
  await user.click(screen.getByRole("button", { name: /reporting period/i }));
  expect(screen.getByRole("button", { name: /^Last month/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: /^All time/ }).getAttribute("aria-pressed")).toBe("false");
});

test("choosing a preset reports its resolved window", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const onChange = renderPicker();
  await user.click(screen.getByRole("button", { name: /reporting period/i }));
  await user.click(await screen.findByRole("button", { name: /^All time/ }));

  expect(onChange).toHaveBeenCalledTimes(1);
  // All time is bounded by real activity, not the old "2000-01-01" epoch.
  expect(onChange.mock.calls[0][0]).toMatchObject({ start: "2026-07-14", end: "2026-07-17", preset: "allTime" });
});

test("picking two days on the calendar reports ISO strings for the days clicked", async () => {
  // The local/UTC adapter guard: react-day-picker hands back LOCAL Dates, and a naive round-trip
  // through the UTC iso() helper would report the day before in any negative-offset zone.
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const onChange = renderPicker(vi.fn(), resolvePreset("thisMonth", TODAY, BOUNDS));
  await user.click(screen.getByRole("button", { name: /reporting period/i }));

  // The window is clamped to the data span, so the days are unambiguous — click them by date.
  await user.click(dayButton("2026-07-15"));
  await user.click(dayButton("2026-07-16"));

  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ start: "2026-07-15", end: "2026-07-16", preset: "custom" });
});

test("the calendar is clamped to the span of real data", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  renderPicker(vi.fn(), resolvePreset("thisMonth", TODAY, BOUNDS));
  await user.click(screen.getByRole("button", { name: /reporting period/i }));

  // 13 Jul is one day before bounds.min (14 Jul) — there is nothing to report there, so it's shut.
  expect(dayButton("2026-07-13").hasAttribute("disabled")).toBe(true);
  // 14 Jul, the first day with activity, is open.
  expect(dayButton("2026-07-14").hasAttribute("disabled")).toBe(false);
});

test("no ref warnings from the popover trigger", async () => {
  // PopoverTrigger asChild only works because Button forwards its ref; a regression there breaks
  // the popover silently in the browser but only shows up as a console error.
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  renderPicker();
  await user.click(screen.getByRole("button", { name: /reporting period/i }));
  expect(errSpy.mock.calls.filter((c) => /Function components cannot be given refs/.test(String(c[0])))).toEqual([]);
  errSpy.mockRestore();
});

// ---- EmptyPeriodHint ---------------------------------------------------------------------------
// Load-bearing: the dashboard is REQUIRED to open on last month, which can legitimately be empty.

function renderHint(period = DEFAULT_PERIOD, onJump = vi.fn(), opts: { bounds?: Bounds | null; isLoading?: boolean } = {}) {
  render(
    <EmptyPeriodHint
      period={period}
      bounds={opts.bounds === undefined ? BOUNDS : opts.bounds}
      isLoading={opts.isLoading ?? false}
      hasActivityIn={hasActivityIn}
      onJump={onJump}
      today={TODAY}
    />,
  );
  return onJump;
}

test("the hint explains an empty period and offers the month where the data is", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const onJump = renderHint();
  expect(screen.getByText(/No activity in June 2026/)).toBeTruthy();

  await user.click(screen.getByRole("button", { name: /Jump to July 2026/ }));
  expect(onJump).toHaveBeenCalledTimes(1);
  expect(onJump.mock.calls[0][0]).toMatchObject({ start: "2026-07-01", end: "2026-07-17" });
});

test("the hint stays out of the way when the period has data", () => {
  renderHint(resolvePreset("thisMonth", TODAY, BOUNDS));
  expect(screen.queryByText(/No activity/)).toBeNull();
});

test("the hint says nothing before it knows", () => {
  // A flash of "no activity" while activity_days is still loading would be a lie.
  renderHint(DEFAULT_PERIOD, vi.fn(), { isLoading: true });
  expect(screen.queryByText(/No activity/)).toBeNull();
});

test("the hint says nothing when there is no activity anywhere", () => {
  // Nothing to jump to on a fresh database.
  renderHint(DEFAULT_PERIOD, vi.fn(), { bounds: null });
  expect(screen.queryByText(/No activity/)).toBeNull();
});
