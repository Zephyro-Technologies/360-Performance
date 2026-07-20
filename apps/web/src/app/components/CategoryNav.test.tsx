import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { CategoryNav, type CategoryNavGroup } from "./CategoryNav";

afterEach(cleanup);

const groups: CategoryNavGroup[] = [
  {
    parent: { id: "p1", slug: "exhaust", name: "Exhaust & Induction" },
    leaves: [
      { id: "l1", slug: "downpipes", name: "Downpipes" },
      { id: "l2", slug: "intakes", name: "Intakes" },
    ],
  },
  { parent: { id: "p2", slug: "suspension", name: "Suspension" }, leaves: [{ id: "l3", slug: "coilovers", name: "Coilovers" }] },
  { parent: { id: "s1", slug: "misc", name: "Misc Performance" }, leaves: [] }, // standalone
];

test("parents collapsed by default; click expands, click again collapses, then selects a leaf", () => {
  const onSelect = vi.fn();
  render(<CategoryNav groups={groups} category="all" onSelect={onSelect} />);

  // children hidden until the parent is expanded
  expect(screen.queryByRole("button", { name: "Downpipes" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /exhaust/i }));
  expect(screen.getByRole("button", { name: "Downpipes" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Intakes" })).toBeTruthy();

  // collapse
  fireEvent.click(screen.getByRole("button", { name: /exhaust/i }));
  expect(screen.queryByRole("button", { name: "Downpipes" })).toBeNull();

  // re-expand and select a leaf
  fireEvent.click(screen.getByRole("button", { name: /exhaust/i }));
  fireEvent.click(screen.getByRole("button", { name: "Downpipes" }));
  expect(onSelect).toHaveBeenCalledWith("downpipes");
});

test("auto-expands the parent of the active category", () => {
  render(<CategoryNav groups={groups} category="intakes" onSelect={vi.fn()} />);
  // the active leaf shows without any click — its parent auto-expanded
  expect(screen.getByRole("button", { name: "Intakes" })).toBeTruthy();
});

test("a standalone (childless) parent is a direct filter", () => {
  const onSelect = vi.fn();
  render(<CategoryNav groups={groups} category="all" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "Misc Performance" }));
  expect(onSelect).toHaveBeenCalledWith("misc");
});

test("All Products clears the filter", () => {
  const onSelect = vi.fn();
  render(<CategoryNav groups={groups} category="downpipes" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "All Products" }));
  expect(onSelect).toHaveBeenCalledWith(null);
});
