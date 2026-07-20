import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";

// Only the Supabase-backed input is stubbed; the URL plumbing under test is real.
vi.mock("../data/analytics", async (orig) => ({
  ...((await orig()) as object),
  useActivityDays: () => ({ data: ["2026-07-14", "2026-07-15", "2026-07-16"], isLoading: false }),
}));
// The presets resolve against "today", so pin it — otherwise these assertions rot overnight.
vi.mock("./useToday", () => ({ useToday: () => "2026-07-17" }));

import { usePeriodParams } from "./usePeriodParams";
import { customPeriod, defaultPeriod } from "../data/periods";

afterEach(cleanup);

// Reads the hook's output into the DOM, and the URL alongside it, so one probe covers both.
function Probe() {
  const { period, setPeriod, bounds, hasActivityIn, periodSearch } = usePeriodParams();
  const loc = useLocation();
  return (
    <div>
      <span data-testid="range">{period.start}..{period.end}</span>
      <span data-testid="preset">{period.preset}</span>
      <span data-testid="label">{period.label}</span>
      <span data-testid="search">{loc.search}</span>
      <span data-testid="periodSearch">{periodSearch}</span>
      <span data-testid="bounds">{bounds ? `${bounds.min}..${bounds.max}` : "none"}</span>
      <span data-testid="julyHasData">{String(hasActivityIn("2026-07-01", "2026-07-31"))}</span>
      <span data-testid="juneHasData">{String(hasActivityIn("2026-06-01", "2026-06-30"))}</span>
      <button onClick={() => setPeriod(customPeriod("2026-07-14", "2026-07-16"))}>custom</button>
      <button onClick={() => setPeriod(defaultPeriod("2026-07-17", { min: "2026-07-14", max: "2026-07-16" }))}>default</button>
    </div>
  );
}

const at = (entry: string) => render(<MemoryRouter initialEntries={[entry]}><Probe /></MemoryRouter>);

test("with no params it resolves the default: the previous complete month", () => {
  at("/");
  expect(screen.getByTestId("range").textContent).toBe("2026-06-01..2026-06-30");
  expect(screen.getByTestId("preset").textContent).toBe("lastMonth");
  expect(screen.getByTestId("periodSearch").textContent).toBe(""); // default -> clean URL
});

test("valid params are honoured as a custom range", () => {
  at("/?from=2026-07-14&to=2026-07-16");
  expect(screen.getByTestId("range").textContent).toBe("2026-07-14..2026-07-16");
  expect(screen.getByTestId("preset").textContent).toBe("custom");
  expect(screen.getByTestId("periodSearch").textContent).toBe("?from=2026-07-14&to=2026-07-16");
});

test("a range that matches a preset window adopts that preset", () => {
  // A shared link should land with the right row selected in the rail, not read as "custom".
  at("/?from=2026-06-01&to=2026-06-30");
  expect(screen.getByTestId("preset").textContent).toBe("lastMonth");
  expect(screen.getByTestId("label").textContent).toBe("June 2026");
});

test.each([
  ["garbage", "/?from=banana&to=2026-07-16"],
  ["inverted", "/?from=2026-07-16&to=2026-07-14"],
  ["half a range", "/?from=2026-07-14"],
  ["impossible date", "/?from=2026-13-45&to=2026-07-16"],
])("%s params fall back to the default instead of throwing", (_name, entry) => {
  at(entry);
  expect(screen.getByTestId("range").textContent).toBe("2026-06-01..2026-06-30");
});

test("choosing a custom range writes it to the URL; returning to the default clears it", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  at("/");
  await user.click(screen.getByText("custom"));
  expect(screen.getByTestId("search").textContent).toBe("?from=2026-07-14&to=2026-07-16");
  await user.click(screen.getByText("default"));
  expect(screen.getByTestId("search").textContent).toBe(""); // both params removed, not left stale
});

test("sibling params survive a period change", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  at("/?tab=expenses");
  await user.click(screen.getByText("custom"));
  expect(screen.getByTestId("search").textContent).toContain("tab=expenses");
});

test("bounds and activity come from the activity_days view", () => {
  at("/");
  expect(screen.getByTestId("bounds").textContent).toBe("2026-07-14..2026-07-16");
  expect(screen.getByTestId("julyHasData").textContent).toBe("true");
  // The default month is genuinely empty on this data — that's what EmptyPeriodHint exists for.
  expect(screen.getByTestId("juneHasData").textContent).toBe("false");
});
