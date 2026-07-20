import { afterEach, test, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";

type MockProduct = {
  id: string; name: string; sku: string; availability: string; visibility: string;
  price_pkr: number; categories: { name: string };
};
// `mock`-prefixed so vitest's vi.mock hoisting permits the reference; varied per test.
let mockProducts: MockProduct[] = [
  { id: "p1", name: "RGB Footwell Kit", sku: "AL-001", availability: "out_of_stock", visibility: "visible", price_pkr: 5000, categories: { name: "Ambient Lighting" } },
];

vi.mock("../../data/catalog", () => ({ useProducts: () => ({ data: mockProducts }) }));
vi.mock("../../data/orders", () => ({ useOrders: () => ({ data: [] }), STAGE_LABEL: {} }));
vi.mock("../../data/invoices", () => ({ useInvoices: () => ({ data: [] }) }));
vi.mock("../../data/crm", () => ({ useCustomers: () => ({ data: [] }) }));
vi.mock("../../data/auth", () => ({ useAuth: () => ({ user: { name: "Admin", email: "a@b.c" }, logout: vi.fn(), can: () => true }) }));

import { Topbar } from "./Topbar";

afterEach(cleanup);

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderTopbar() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Topbar onMenuClick={() => {}} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

test("bell badge reflects out-of-stock products, opens a panel on click, and items navigate", async () => {
  // jsdom can't measure the popper position, but the bug 1 root cause emits a React
  // warning: the Radix trigger's ref is dropped unless Button forwardRefs. Fail on it.
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  renderTopbar();

  const bell = screen.getByRole("button", { name: /notifications/i });
  expect(within(bell).getByText("1")).toBeTruthy(); // bug 2: count from products

  await user.click(bell); // bug 1: the panel must actually open
  const item = await screen.findByText(/out of stock: rgb footwell kit/i);
  expect(item).toBeTruthy();

  await user.click(item); // item is clickable and navigates
  expect(screen.getByTestId("loc").textContent).toBe("/products");

  const refWarnings = errSpy.mock.calls.filter((c) => /Function components cannot be given refs/.test(String(c[0])));
  expect(refWarnings).toEqual([]); // the bell trigger must receive its ref
  errSpy.mockRestore();
});

test("no notifications → no badge, panel shows the empty state", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  mockProducts = [];
  renderTopbar();

  const bell = screen.getByRole("button", { name: /notifications/i });
  expect(within(bell).queryByText("1")).toBeNull();

  await user.click(bell);
  expect(await screen.findByText(/all caught up/i)).toBeTruthy();

  mockProducts = [
    { id: "p1", name: "RGB Footwell Kit", sku: "AL-001", availability: "out_of_stock", visibility: "visible", price_pkr: 5000, categories: { name: "Ambient Lighting" } },
  ];
});
