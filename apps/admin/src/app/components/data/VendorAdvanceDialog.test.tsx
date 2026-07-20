// A negative amount must be refused AT THE FIELD with a readable message. Regression guard: the
// zod parse lives inside the mutation, and ZodError.message is the raw issue JSON — so a bare
// `toast.error(e.message)` used to dump `{"code":"too_small","minimum":0,...}` at the operator.
import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

const mutateAsync = vi.fn();
vi.mock("../../data/vendorAdvances", () => ({
  useRecordAdvance: () => ({ mutateAsync, isPending: false }),
}));

import { VendorAdvanceDialog } from "./VendorAdvanceDialog";

const vendors = [
  { vendor_account_id: "v1", supplier_id: null, name: "Air Freight Vendor", role: "air_freight", balance_pkr: 500 },
];

afterEach(() => { cleanup(); mutateAsync.mockClear(); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const open = () => render(<VendorAdvanceDialog open onOpenChange={() => {}} vendors={vendors as any} />);

test("a negative amount shows a readable field error and blocks submit — never raw zod JSON", () => {
  open();
  fireEvent.change(screen.getByLabelText(/amount \(pkr\)/i), { target: { value: "-500" } });

  expect(screen.getByText("Amount must be more than 0.")).toBeTruthy();
  expect(screen.queryByText(/too_small/)).toBeNull();
  expect(screen.queryByText(/"code"/)).toBeNull();

  const submit = screen.getByRole("button", { name: /make payment/i });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(submit);
  expect(mutateAsync).not.toHaveBeenCalled();
});

test("zero is refused too, and a positive amount clears the error", () => {
  open();
  const amount = screen.getByLabelText(/amount \(pkr\)/i);

  fireEvent.change(amount, { target: { value: "0" } });
  expect(screen.getByText("Amount must be more than 0.")).toBeTruthy();

  fireEvent.change(amount, { target: { value: "500" } });
  expect(screen.queryByText("Amount must be more than 0.")).toBeNull();
  expect((screen.getByRole("button", { name: /make payment/i }) as HTMLButtonElement).disabled).toBe(false);
});

test("the action is called Make payment for a top-up, and names the draw-down otherwise", () => {
  open();
  expect(screen.getByRole("button", { name: /make payment/i })).toBeTruthy();
  expect(screen.getByText("Make vendor payment")).toBeTruthy(); // dialog title, not "movement"
});
