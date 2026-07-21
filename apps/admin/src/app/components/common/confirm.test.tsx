// The app-styled replacement for window.confirm(). What matters is that it resolves the SAME
// boolean contract the native dialog did — every call site is `if (!(await confirm(...))) return;`,
// so a promise that resolves wrong (or never) would either block a delete or perform it silently.
import { afterEach, describe, test, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "./confirm";

afterEach(cleanup);

function Harness({ onResult, opts }: { onResult: (v: boolean) => void; opts?: Parameters<ReturnType<typeof useConfirm>>[0] }) {
  const confirm = useConfirm();
  return (
    <button onClick={async () => onResult(await confirm(opts ?? { title: "Delete ORD-1200?" }))}>
      go
    </button>
  );
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "go" }));

describe("confirm dialog", () => {
  test("resolves true when confirmed", async () => {
    const onResult = vi.fn();
    render(<ConfirmProvider><Harness onResult={onResult} /></ConfirmProvider>);
    open();

    expect(await screen.findByText("Delete ORD-1200?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  test("resolves false when cancelled — the guard must stop the delete", async () => {
    const onResult = vi.fn();
    render(<ConfirmProvider><Harness onResult={onResult} /></ConfirmProvider>);
    open();

    await screen.findByText("Delete ORD-1200?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  test("dismissing with Esc resolves false rather than leaving the caller hanging", async () => {
    const onResult = vi.fn();
    render(<ConfirmProvider><Harness onResult={onResult} /></ConfirmProvider>);
    open();

    await screen.findByText("Delete ORD-1200?");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  test("a destructive call labels its button Delete; a neutral one says Confirm", async () => {
    const { unmount } = render(
      <ConfirmProvider><Harness onResult={vi.fn()} opts={{ title: "Delete it?", destructive: true }} /></ConfirmProvider>,
    );
    open();
    expect(await screen.findByRole("button", { name: "Delete" })).toBeTruthy();
    unmount();
    cleanup();

    render(<ConfirmProvider><Harness onResult={vi.fn()} opts={{ title: "Receive all?" }} /></ConfirmProvider>);
    open();
    expect(await screen.findByRole("button", { name: "Confirm" })).toBeTruthy();
  });

  test("shows the description and honours a custom confirm label", async () => {
    render(
      <ConfirmProvider>
        <Harness onResult={vi.fn()} opts={{ title: "Void this invoice?", description: "This cannot be undone.", confirmLabel: "Void invoice" }} />
      </ConfirmProvider>,
    );
    open();
    expect(await screen.findByText("This cannot be undone.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Void invoice" })).toBeTruthy();
  });

  test("nothing is rendered until a confirm is actually requested", () => {
    render(<ConfirmProvider><Harness onResult={vi.fn()} /></ConfirmProvider>);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("using it without the provider fails loudly instead of silently skipping the guard", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Harness onResult={vi.fn()} />)).toThrow(/ConfirmProvider/);
    spy.mockRestore();
  });
});
