import { afterEach, test, expect } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInput } from "./PhoneInput";

afterEach(cleanup);

// The component is controlled, so the harness owns the value and echoes what
// would actually be persisted to the `phone` column.
function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <PhoneInput value={v} onChange={setV} />
      <output data-testid="stored">{v}</output>
    </>
  );
}

const stored = () => screen.getByTestId("stored").textContent;
const field = () => screen.getByRole("textbox") as HTMLInputElement;

test("a typed national number is stored with the selected country's dial code", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<Harness />);
  await user.type(field(), "3001234567");
  expect(stored()).toBe("+92 3001234567");
});

test("a legacy local number drops its trunk zero instead of being double-prefixed", () => {
  render(<Harness initial="03001234567" />);
  // "0300…" is a local dialling form; with a country code the leading 0 is wrong.
  expect(field().value).toBe("3001234567");
});

test("an already-international value is split back into country + national parts", () => {
  render(<Harness initial="+971 501234567" />);
  expect(field().value).toBe("501234567");
  expect(screen.getByRole("combobox", { name: "Country code" }).textContent).toContain("+971");
});

test("clearing the field stores an empty string, never a bare dial code", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<Harness initial="+92 3001234567" />);
  await user.clear(field());
  // "+92 " would save a junk phone number on every record whose phone was skipped.
  expect(stored()).toBe("");
});

test("the hint counts the digits still owed for the chosen country", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<Harness />);
  expect(screen.getByText(/10 digits after \+92/)).toBeTruthy();
  await user.type(field(), "300");
  expect(screen.getByText("7 more digits")).toBeTruthy();
  await user.type(field(), "1234567");
  expect(screen.getByText("Looks complete")).toBeTruthy();
});

test("switching country re-prefixes the number and re-scopes the hint", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<Harness initial="+92 3001234567" />);
  await user.click(screen.getByRole("combobox", { name: "Country code" }));
  await user.click(screen.getByRole("option", { name: /China/ }));
  expect(stored()).toBe("+86 3001234567");
  // China expects 11 national digits, so the same 10 digits are now one short.
  expect(screen.getByText("1 more digit")).toBeTruthy();
});
