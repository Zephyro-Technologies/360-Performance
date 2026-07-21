// Column drag-to-reorder + full-screen mode on the query sheet grid.
//
// Reordering PERSISTS (it writes query_sheets.columns), so the exact array sent matters: the saved
// order IS the sheet's layout, and a wrong array would silently rearrange the operator's sheet.
import { afterEach, describe, test, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mockUpdateSheet = vi.fn().mockResolvedValue(undefined);

vi.mock("../../data/catalog", async (orig) => ({
  ...((await orig()) as object),
  useProducts: () => ({ data: [], isLoading: false }),
  useSuppliers: () => ({ data: [], isLoading: false }),
}));
vi.mock("../../data/oneoffProducts", async (orig) => ({
  ...((await orig()) as object),
  useOneoffProducts: () => ({ data: [], isLoading: false }),
}));
vi.mock("../../data/querySheets", async (orig) => ({
  ...((await orig()) as object),
  useAddQuerySheetRows: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateQuerySheetRow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteQuerySheetRow: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuerySheet: () => ({ mutateAsync: mockUpdateSheet, isPending: false }),
}));

import { QuerySheetGrid } from "./QuerySheetGrid";
import type { QuerySheetDetail } from "../../data/querySheets";

afterEach(() => {
  cleanup();
  mockUpdateSheet.mockClear();
});

const sheet: QuerySheetDetail = {
  id: "s1",
  title: "Civic enquiry",
  notes: null,
  columns: ["name", "qty", "retail", "vendor"],
  custom_columns: [],
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  rows: [{ id: "r1", position: 0, product_id: null, cells: { name: "Turbo", qty: 2 } }],
};

const headerCells = () =>
  Array.from(document.querySelectorAll("thead tr:nth-child(2) th"))
    .map((th) => th.textContent?.trim())
    .filter((t) => t);

describe("query sheet grid — column drag", () => {
  test("dropping a header on another saves the reordered layout", () => {
    render(<QuerySheetGrid sheet={sheet} editable />);
    expect(headerCells()).toEqual(["Item", "Qty", "Retail\nPrice", "Vendor"]);

    // Drag "Vendor" onto "Qty" → Vendor takes Qty's slot, the rest shuffle right.
    const ths = Array.from(document.querySelectorAll("thead tr:nth-child(2) th"));
    const qty = ths[1];
    const vendor = ths[3];
    fireEvent.dragStart(vendor);
    fireEvent.dragOver(qty);
    fireEvent.drop(qty);

    expect(mockUpdateSheet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSheet).toHaveBeenCalledWith({ id: "s1", columns: ["name", "vendor", "qty", "retail"] });
  });

  test("the pinned Item column can neither be dragged nor dropped onto", () => {
    render(<QuerySheetGrid sheet={sheet} editable />);
    const ths = Array.from(document.querySelectorAll("thead tr:nth-child(2) th"));
    const item = ths[0];
    const qty = ths[1];

    // It is the row label and is `sticky left-0` — it only works as the first column.
    expect(item.getAttribute("draggable")).not.toBe("true");
    expect(qty.getAttribute("draggable")).toBe("true");

    fireEvent.dragStart(qty);
    fireEvent.drop(item);
    expect(mockUpdateSheet).not.toHaveBeenCalled();
  });

  test("a viewer cannot rearrange the sheet", () => {
    render(<QuerySheetGrid sheet={sheet} editable={false} />);
    const ths = Array.from(document.querySelectorAll("thead tr:nth-child(2) th"));
    expect(ths[1].getAttribute("draggable")).not.toBe("true");
    fireEvent.dragStart(ths[3]);
    fireEvent.drop(ths[1]);
    expect(mockUpdateSheet).not.toHaveBeenCalled();
  });

  test("dropping a column on itself is a no-op, not a pointless write", () => {
    render(<QuerySheetGrid sheet={sheet} editable />);
    const ths = Array.from(document.querySelectorAll("thead tr:nth-child(2) th"));
    fireEvent.dragStart(ths[1]);
    fireEvent.drop(ths[1]);
    expect(mockUpdateSheet).not.toHaveBeenCalled();
  });
});

describe("query sheet grid — full screen", () => {
  test("full screen opens, shows the sheet title, and Esc closes it", () => {
    render(<QuerySheetGrid sheet={sheet} editable />);
    expect(screen.queryByRole("button", { name: /exit full screen/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /full screen/i }));
    expect(screen.getByRole("button", { name: /exit full screen/i })).toBeTruthy();
    // The title is only rendered by the overlay — the page header is hidden behind it.
    expect(screen.getByText("Civic enquiry")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden"); // page behind is scroll-locked

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /exit full screen/i })).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden"); // lock released
  });

  test("Esc inside a cell doesn't yank the operator out of full screen", () => {
    render(<QuerySheetGrid sheet={sheet} editable />);
    fireEvent.click(screen.getByRole("button", { name: /full screen/i }));

    const cell = document.querySelector("tbody input") as HTMLInputElement;
    cell.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: /exit full screen/i })).toBeTruthy();
  });

  test("a viewer can go full screen too (read-only sheets are just as wide)", () => {
    render(<QuerySheetGrid sheet={sheet} editable={false} />);
    fireEvent.click(screen.getByRole("button", { name: /full screen/i }));
    expect(screen.getByRole("button", { name: /exit full screen/i })).toBeTruthy();
  });
});
