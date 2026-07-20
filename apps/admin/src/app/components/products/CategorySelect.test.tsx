import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategorySelect, toParentOptions } from "./CategorySelect";
import type { CategoryGroup } from "../../data/catalog";

afterEach(cleanup);

const groups: CategoryGroup[] = [
  {
    parent: { id: "p1", slug: "exhaust", name: "Exhaust & Induction", parent_id: null, sort_order: 1 },
    leaves: [
      { id: "l1", slug: "downpipes", name: "Downpipes", parent_id: "p1", sort_order: 1 },
      { id: "l2", slug: "intakes", name: "Intakes", parent_id: "p1", sort_order: 2 },
    ],
  },
  // standalone top-level category that holds products directly (no children)
  { parent: null, leaves: [{ id: "s1", slug: "misc", name: "Misc Performance", parent_id: null, sort_order: 9 }] },
];

test("toParentOptions: real parents keep children; a standalone leaf becomes its own parent", () => {
  const opts = toParentOptions(groups);
  expect(opts).toHaveLength(2);
  expect(opts[0]).toMatchObject({ key: "p1", name: "Exhaust & Induction" });
  expect(opts[0].leaves.map((l) => l.id)).toEqual(["l1", "l2"]);
  expect(opts[1]).toMatchObject({ key: "s1", name: "Misc Performance" });
  expect(opts[1].leaves.map((l) => l.id)).toEqual(["s1"]); // the parent IS the leaf
});

test("both dropdowns OPEN and SELECT: pick a parent → its sub-categories appear → leaf id stored", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const onChange = vi.fn();
  render(<CategorySelect groups={groups} value="" onChange={onChange} />);

  // Parent dropdown opens and lists the parents
  await user.click(screen.getByRole("combobox", { name: /parent category/i }));
  await user.click(await screen.findByRole("option", { name: "Exhaust & Induction" }));
  // multi-child parent → leaf is cleared until a sub is chosen
  expect(onChange).toHaveBeenLastCalledWith("");
  onChange.mockClear();

  // Sub dropdown now opens and is filtered to that parent's children
  await user.click(screen.getByRole("combobox", { name: /sub-category/i }));
  expect(await screen.findByRole("option", { name: "Downpipes" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Intakes" })).toBeTruthy();
  await user.click(screen.getByRole("option", { name: "Downpipes" }));
  expect(onChange).toHaveBeenCalledWith("l1"); // stores the single LEAF id
});

test("edge case: a standalone/childless parent auto-selects itself as the leaf", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const onChange = vi.fn();
  render(<CategorySelect groups={groups} value="" onChange={onChange} />);

  await user.click(screen.getByRole("combobox", { name: /parent category/i }));
  await user.click(await screen.findByRole("option", { name: "Misc Performance" }));
  expect(onChange).toHaveBeenCalledWith("s1"); // selectable, not stranded
});
