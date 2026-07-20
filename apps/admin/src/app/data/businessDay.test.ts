// "Today" must be TODAY IN PAKISTAN (PKT, UTC+5) — the business trades in Islamabad and the DB
// stores plain `date` columns written against that day. If these fail, the reporting period will
// silently shift by a day for anyone working outside PKT, moving money between months at the
// boundary. Vitest runs with whatever TZ the shell has, so each case pins an instant and asserts
// the business day, independent of the runner's zone.
import { test, expect, vi, afterEach } from "vitest";
import { businessTodayISO, businessToday, iso, monthWindows } from "./analytics";

afterEach(() => vi.useRealTimers());

test("the business day is Pakistan's, not UTC's", () => {
  // 2026-07-17 20:00 UTC is already 01:00 on the 18th in Islamabad.
  expect(businessTodayISO(new Date("2026-07-17T20:00:00Z"))).toBe("2026-07-18");
  // 2026-07-17 18:59 UTC is 23:59 on the 17th — still the same business day.
  expect(businessTodayISO(new Date("2026-07-17T18:59:00Z"))).toBe("2026-07-17");
  // Exactly PKT midnight.
  expect(businessTodayISO(new Date("2026-07-17T19:00:00Z"))).toBe("2026-07-18");
});

test("early-morning UTC is still the previous business day nowhere", () => {
  // 00:30 UTC = 05:30 PKT the same date — Pakistan is always ahead, never behind.
  expect(businessTodayISO(new Date("2026-01-01T00:30:00Z"))).toBe("2026-01-01");
});

test("the business day rolls the YEAR over on Pakistan's clock", () => {
  // 31 Dec 19:00 UTC = 1 Jan 00:00 PKT. A UTC-anchored reading would report the wrong year, and
  // "This year" would resolve to the whole of the year that just ended.
  expect(businessTodayISO(new Date("2025-12-31T19:00:00Z"))).toBe("2026-01-01");
  expect(businessTodayISO(new Date("2025-12-31T18:00:00Z"))).toBe("2025-12-31");
});

test("businessToday() is a UTC-midnight Date carrying the Pakistan day", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-17T20:00:00Z")); // 18th in PKT
  const d = businessToday();
  expect(iso(d)).toBe("2026-07-18");
  // UTC-midnight matters: the downstream math reads it with the UTC getters.
  expect(d.getUTCHours()).toBe(0);
});

test("monthWindows follows the Pakistan day across a month boundary", () => {
  vi.useFakeTimers();
  // 30 Jun 19:00 UTC = 1 Jul 00:00 PKT. The office is in July; a UTC reading would still say June,
  // which would make "last month" resolve to May and quietly restate the salary figures.
  vi.setSystemTime(new Date("2026-06-30T19:00:00Z"));
  const mw = monthWindows();
  expect(mw.thisStart).toBe("2026-07-01");
  expect(mw.lastStart).toBe("2026-06-01");
  expect(mw.lastEnd).toBe("2026-06-30");
  expect(mw.lastLabel).toBe("June 2026");
});

test("monthWindows labels a part-elapsed month 'so far' but a complete one plainly", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-17T06:00:00Z"));
  expect(monthWindows().thisLabel).toBe("July 2026 so far");

  vi.setSystemTime(new Date("2026-07-31T06:00:00Z")); // last day of the month, PKT
  expect(monthWindows().thisLabel).toBe("July 2026");
});
