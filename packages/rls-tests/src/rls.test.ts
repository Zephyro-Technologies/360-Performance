// ===========================================================================
// 360 Performance — RLS NEGATIVE TEST SUITE
//
// Proves the security guarantees hold at the DATABASE, not just in the app:
//   - anon cannot write ANY table and cannot read the B2 cost/margin columns
//   - viewer cannot write; staff cannot reverse payments or delete invoices/orders
//   - a demoted admin's stale JWT cannot perform admin deletes (has_role reads
//     profiles, not the claim)
//   - payments are fully immutable (no UPDATE/DELETE by anyone); invoice delete is
//     admin-only and FK-RESTRICTed when payments exist
//   - storage writes are staff/admin-only (anon + viewer denied)
//
// Runs against a live local Supabase (CI: `supabase start` then `test:rls`).
// The keys below are the standard *local demo* keys (deterministic, public — NOT
// production secrets); override via env when needed.
// ===========================================================================
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

const URL = process.env.API_URL || "http://127.0.0.1:54421";
const ANON =
  process.env.ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  process.env.SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const svc = createClient(URL, SERVICE, opts); // service-role: bypasses RLS (setup/verify only)
const anon = createClient(URL, ANON, opts); // anon role (the public website)

type Role = "admin" | "staff" | "viewer";
interface RoleUser {
  client: SupabaseClient;
  uid: string;
}

const createdUserIds: string[] = [];

async function makeUser(role: Role): Promise<RoleUser> {
  const email = `rls-${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const password = "Test!2345";
  const { data: created, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`create ${role}: ${error?.message}`);
  const uid = created.user.id;
  createdUserIds.push(uid);
  // Override the trigger's assignment so the role is deterministic regardless of order.
  const { error: upErr } = await svc.from("profiles").update({ role }).eq("id", uid);
  if (upErr) throw new Error(`set role ${role}: ${upErr.message}`);
  const client = createClient(URL, ANON, opts);
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`signin ${role}: ${signErr.message}`);
  return { client, uid };
}

async function rowExists(table: string, id: string): Promise<boolean> {
  const { data } = await svc.from(table).select("id").eq("id", id).maybeSingle();
  return !!data;
}

async function expectInsertDenied(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { error } = await client.from(table).insert(row);
  expect(error, `${table} insert must be denied`).toBeTruthy();
}

async function expectSelectDenied(client: SupabaseClient, table: string) {
  const { error } = await client.from(table).select("*").limit(1);
  expect(error, `${table} select must be denied`).toBeTruthy();
}

// For a table the role HOLDS a grant on but no RLS policy matches (query_sheets is admin-only,
// yet `authenticated` needs the grant so admins can read at all), Postgres returns zero rows
// rather than an error. Row-filtering IS the denial here — asserting on `error` would fail even
// though nothing leaked.
async function expectSelectEmpty(client: SupabaseClient, table: string) {
  const { data, error } = await client.from(table).select("*").limit(1);
  expect(error, `${table} select should not error, it should return nothing`).toBeFalsy();
  expect(data ?? [], `${table} must expose no rows to this role`).toHaveLength(0);
}

// A "denial-shaped" RPC error: a PostgREST 404 (PGRST202 — the function isn't in the caller's
// schema cache because the role has no EXECUTE grant) or a 42501 permission-denied — NOT a
// business-logic error. This distinguishes "the role can't call it at all" from "it called the
// function and the function errored on the arguments" (which would mean the grant leaked).
async function expectRpcDenied(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const { error } = await client.rpc(fn, args);
  expect(error, `rpc ${fn} must be denied`).toBeTruthy();
  const code = (error as { code?: string } | null)?.code ?? "";
  const msg = error?.message ?? "";
  const denied =
    code === "42501" || code === "PGRST202" || code === "PGRST301" ||
    /permission denied|find the function/i.test(msg);
  expect(denied, `rpc ${fn} must be a permission/not-found denial — got ${code}: ${msg}`).toBe(true);
}

let admin: RoleUser, staff: RoleUser, viewer: RoleUser;
let catId: string, customerId: string;
let orderKeep: string, orderDel: string, invoiceKeep: string, invoiceDel: string, paymentKeep: string;
let poId: string, poLineId: string, invProductId: string;
let v3Product: string, v3Order: string, v3Line: string;
let v4Inv: string, v4Deal: string, v4Prod: string, v4Order: string, v4Payout: string, v4Batch: string;
let v6Plan: string, v6PlanFree: string;
let v8Prod: string, v8Batch: string;
let v9HouseProd: string, v9Batch: string, v9Order: string, v9Invoice: string, v9Payment: string, v9Corr: string | undefined;
let fg2Prod: string, fg2Batch: string, fg2Order: string, fg2DrawnLine: string, fg2UndrawnLine: string, fg2SaleMv: string, fg2BareOrder: string;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeAll(async () => {
  admin = await makeUser("admin");
  staff = await makeUser("staff");
  viewer = await makeUser("viewer");

  const { data: leaf } = await svc.from("categories").select("id").not("parent_id", "is", null).limit(1);
  catId = leaf?.[0]?.id ?? (await svc.from("categories").select("id").limit(1)).data![0].id;

  customerId = (await svc.from("customers").insert({ name: "RLS Test Customer" }).select("id").single()).data!.id;

  const mkOrder = async () =>
    (await svc.from("orders").insert({ customer_id: customerId, total_pkr: 500 }).select("id").single()).data!.id;
  orderKeep = await mkOrder();
  orderDel = await mkOrder();

  const mkInvoice = async () =>
    (await svc.from("invoices").insert({ customer_id: customerId, total_pkr: 10000 }).select("id").single()).data!.id;
  invoiceKeep = await mkInvoice();
  invoiceDel = await mkInvoice();

  paymentKeep = (
    await svc
      .from("payments")
      .insert({ invoice_id: invoiceKeep, amount_pkr: 100, method: "cash", kind: "payment" })
      .select("id")
      .single()
  ).data!.id;

  // a row staff/admin may read but viewer/anon may not
  await svc.from("audit_log").insert({ action: "rls-probe", entity_type: "test", entity_id: "probe" });

  // Phase 2 inventory/cost-spine fixtures (receive RPC + immutability tests).
  // Own fixture rather than a seed row. This suite also runs against databases restored from
  // the client's real imported data, where no supplier is named "FY MOTO" — the lookup returned
  // null, beforeAll threw on .id, and all 96 tests silently SKIPPED rather than failed.
  const supId = (await svc.from("suppliers")
    .insert({ name: `RLS Vendor ${Date.now()}`, country: "China", currency: "CNY" })
    .select("id").single()).data!.id;
  invProductId = (await svc.from("products").insert({ sku: `RLS-INV-${Date.now()}`, category_id: catId, name: "RLS Inventory Product", made_to_order: false }).select("id").single()).data!.id;
  poId = (await svc.from("purchase_orders").insert({ supplier_id: supId, status: "ordered", frozen_rate_rmb_pkr: 40 }).select("id").single()).data!.id;
  poLineId = (await svc.from("purchase_order_lines").insert({ purchase_order_id: poId, product_id: invProductId, qty_ordered: 10, unit_cost_rmb: 900, shipping_per_unit_pkr: 340 }).select("id").single()).data!.id;

  // Phase 3 fulfilment fixtures: a product with on-hand stock + an order line to deliver.
  v3Product = (await svc.from("products").insert({ sku: `RLS-FUL-${Date.now()}`, category_id: catId, name: "RLS Fulfil Product", made_to_order: false }).select("id").single()).data!.id;
  const v3PoLine = (await svc.from("purchase_order_lines").insert({ purchase_order_id: poId, product_id: v3Product, qty_ordered: 8, unit_cost_rmb: 100 }).select("id").single()).data!.id;
  const v3Batch = (await svc.from("batches").insert({ product_id: v3Product, source_po_line_id: v3PoLine, qty_received: 8, landed_cost_pkr: 5000, received_on: "2026-01-01" }).select("id").single()).data!.id;
  await svc.from("stock_movements").insert({ batch_id: v3Batch, kind: "receive", qty: 8, occurred_on: "2026-01-01" });
  v3Order = (await svc.from("orders").insert({ customer_id: customerId, total_pkr: 500000 }).select("id").single()).data!.id;
  v3Line = (await svc.from("order_items").insert({ order_id: v3Order, product_id: v3Product, name: "RLS Fulfil Product", sku: "FUL", qty: 5, price_pkr: 100000 }).select("id").single()).data!.id;

  // Phase 4 investor fixtures: an investor product with a delivered sale -> accrued owed.
  // capital 4×5000 + share 0.5×(4×(10000−5000)) = 20000 + 10000 = 30000 owed.
  v4Inv = (await svc.from("investors").insert({ name: "RLS Investor" }).select("id").single()).data!.id;
  v4Deal = (await svc.from("investor_deals").insert({ investor_id: v4Inv, split_pct: 0.5 }).select("id").single()).data!.id;
  v4Prod = (await svc.from("products").insert({ sku: `RLS-INVOWN-${Date.now()}`, category_id: catId, name: "RLS Investor Product", made_to_order: false, owner_kind: "investor", investor_deal_id: v4Deal }).select("id").single()).data!.id;
  const v4PoLine = (await svc.from("purchase_order_lines").insert({ purchase_order_id: poId, product_id: v4Prod, qty_ordered: 10, unit_cost_rmb: 100 }).select("id").single()).data!.id;
  v4Batch = (await svc.from("batches").insert({ product_id: v4Prod, source_po_line_id: v4PoLine, qty_received: 10, landed_cost_pkr: 5000, received_on: "2026-01-01" }).select("id").single()).data!.id;
  await svc.from("stock_movements").insert({ batch_id: v4Batch, kind: "receive", qty: 10, occurred_on: "2026-01-01" });
  v4Order = (await svc.from("orders").insert({ customer_id: customerId, total_pkr: 40000 }).select("id").single()).data!.id;
  const v4Line = (await svc.from("order_items").insert({ order_id: v4Order, product_id: v4Prod, name: "RLS Investor Product", sku: "INVOWN", qty: 4, price_pkr: 10000 }).select("id").single()).data!.id;
  await svc.from("stock_movements").insert({ batch_id: v4Batch, kind: "sale", qty: 4, order_item_id: v4Line });

  // Phase 6 pipeline fixtures: an approved, product+vendor-linked plan (graduatable) + a free-text one.
  v6Plan = (await svc.from("planned_purchases").insert({ item_name: "RLS Plan", product_id: invProductId, supplier_id: supId, planned_qty: 3, status: "approved", priority: "high" }).select("id").single()).data!.id;
  v6PlanFree = (await svc.from("planned_purchases").insert({ item_name: "RLS Free-text", status: "researching" }).select("id").single()).data!.id;

  // Phase 8 marketing fixture: a dedicated HOUSE product with stock to PR-gift (investor block uses v4Prod/v4Batch).
  v8Prod = (await svc.from("products").insert({ sku: `RLS-PR8-${Date.now()}`, category_id: catId, name: "RLS PR House", made_to_order: false }).select("id").single()).data!.id;
  const v8PoLine = (await svc.from("purchase_order_lines").insert({ purchase_order_id: poId, product_id: v8Prod, qty_ordered: 10, unit_cost_rmb: 100 }).select("id").single()).data!.id;
  v8Batch = (await svc.from("batches").insert({ product_id: v8Prod, source_po_line_id: v8PoLine, qty_received: 10, landed_cost_pkr: 4000, received_on: "2026-01-01" }).select("id").single()).data!.id;
  await svc.from("stock_movements").insert({ batch_id: v8Batch, kind: "receive", qty: 10, occurred_on: "2026-01-01" });


  // Phase 9 corrections: a house product with stock (replacement) + an order/invoice/payment (refund).
  v9HouseProd = (await svc.from("products").insert({ sku: `RLS-CORR-${Date.now()}`, category_id: catId, name: "RLS Corr House", made_to_order: false }).select("id").single()).data!.id;
  const v9PoLine = (await svc.from("purchase_order_lines").insert({ purchase_order_id: poId, product_id: v9HouseProd, qty_ordered: 5, unit_cost_rmb: 100 }).select("id").single()).data!.id;
  v9Batch = (await svc.from("batches").insert({ product_id: v9HouseProd, source_po_line_id: v9PoLine, qty_received: 5, landed_cost_pkr: 3000, received_on: "2026-01-01" }).select("id").single()).data!.id;
  await svc.from("stock_movements").insert({ batch_id: v9Batch, kind: "receive", qty: 5, occurred_on: "2026-01-01" });
  v9Order = (await svc.from("orders").insert({ customer_id: customerId, total_pkr: 5000 }).select("id").single()).data!.id;
  v9Invoice = (await svc.from("invoices").insert({ customer_id: customerId, order_id: v9Order, subtotal_pkr: 5000, tax_pkr: 0, total_pkr: 5000 }).select("id").single()).data!.id;
  v9Payment = (await svc.from("payments").insert({ invoice_id: v9Invoice, amount_pkr: 5000, method: "cash", kind: "payment" }).select("id").single()).data!.id;

  // Fix Group 2: an order with a DRAWN line (has a kind='sale' movement, partly delivered 5/8) + an
  // UN-drawn line, plus a bare order — for the freeze / order-delete-guard / sale-reversal tests.
  fg2Prod = (await svc.from("products").insert({ sku: `RLS-FG2-${Date.now()}`, category_id: catId, name: "RLS FG2 House", made_to_order: false }).select("id").single()).data!.id;
  const fg2PoLine = (await svc.from("purchase_order_lines").insert({ purchase_order_id: poId, product_id: fg2Prod, qty_ordered: 10, unit_cost_rmb: 100 }).select("id").single()).data!.id;
  fg2Batch = (await svc.from("batches").insert({ product_id: fg2Prod, source_po_line_id: fg2PoLine, qty_received: 10, landed_cost_pkr: 600, received_on: "2026-01-01" }).select("id").single()).data!.id;
  await svc.from("stock_movements").insert({ batch_id: fg2Batch, kind: "receive", qty: 10, occurred_on: "2026-01-01" });
  fg2Order = (await svc.from("orders").insert({ customer_id: customerId, total_pkr: 8000 }).select("id").single()).data!.id;
  fg2DrawnLine = (await svc.from("order_items").insert({ order_id: fg2Order, product_id: fg2Prod, name: "drawn", qty: 8, price_pkr: 1000, qty_delivered: 5 }).select("id").single()).data!.id;
  fg2UndrawnLine = (await svc.from("order_items").insert({ order_id: fg2Order, product_id: fg2Prod, name: "undrawn", qty: 3, price_pkr: 500 }).select("id").single()).data!.id;
  fg2SaleMv = (await svc.from("stock_movements").insert({ batch_id: fg2Batch, kind: "sale", qty: 5, order_item_id: fg2DrawnLine, occurred_on: "2026-01-01" }).select("id").single()).data!.id;
  fg2BareOrder = (await svc.from("orders").insert({ customer_id: customerId, total_pkr: 0 }).select("id").single()).data!.id;
});

afterAll(async () => {
  // Best-effort cleanup (service-role bypasses RLS; respect FK RESTRICT order).
  try {
    await svc.from("suppliers").delete().like("name", "RLS Vendor %"); // the PO fixture vendor
    await svc.from("expenses").delete().eq("note", "RLS-P10-opex"); // Phase 10 opex test row
    await svc.from("refunds").delete().eq("reason", "RLS-refund-probe"); // standalone refund test rows
    await svc.from("customer_deliveries").delete().eq("courier", "RLS-delivery-probe"); // delivery test rows
    // Phase 9 corrections: replacement movements + ledger rows, then the dedicated order/invoice/payment/product
    await svc.from("stock_movements").delete().eq("batch_id", v9Batch);
    await svc.from("corrections").delete().eq("order_id", v9Order);
    await svc.from("corrections").delete().eq("order_id", v4Order); // the investor-untouched compensation
    await svc.from("payments").delete().eq("invoice_id", v9Invoice);
    await svc.from("invoices").delete().eq("id", v9Invoice);
    await svc.from("orders").delete().eq("id", v9Order);
    await svc.from("batches").delete().eq("product_id", v9HouseProd);
    await svc.from("purchase_order_lines").delete().eq("product_id", v9HouseProd);
    await svc.from("products").delete().eq("id", v9HouseProd);
    // Fix Group 2: movements first, then the orders (cascade lines), then batch/po_line/product
    await svc.from("stock_movements").delete().eq("batch_id", fg2Batch);
    await svc.from("orders").delete().in("id", [fg2Order, fg2BareOrder]);
    await svc.from("batches").delete().eq("product_id", fg2Prod);
    await svc.from("purchase_order_lines").delete().eq("product_id", fg2Prod);
    await svc.from("products").delete().eq("id", fg2Prod);
    // marketing fixtures: gift movements + logs, then the dedicated house product
    await svc.from("stock_movements").delete().eq("batch_id", v8Batch);
    await svc.from("pr_gifts").delete().eq("product_id", v8Prod);
    await svc.from("batches").delete().eq("product_id", v8Prod);
    await svc.from("purchase_order_lines").delete().eq("product_id", v8Prod);
    await svc.from("products").delete().eq("id", v8Prod);
    // pipeline fixtures: the graduated PO (if any) + its line, then the plans
    const { data: gp } = await svc.from("planned_purchases").select("graduated_to_po_id").eq("id", v6Plan).maybeSingle();
    if (gp?.graduated_to_po_id) {
      await svc.from("purchase_order_lines").delete().eq("purchase_order_id", gp.graduated_to_po_id);
      await svc.from("purchase_orders").delete().eq("id", gp.graduated_to_po_id);
    }
    await svc.from("planned_purchases").delete().in("id", [v6Plan, v6PlanFree]);
    // inventory + fulfilment + investor fixtures (payouts -> orders cascade items ->
    // movements -> batches -> po -> products -> deals -> investors)
    await svc.from("investor_payouts").delete().eq("investor_id", v4Inv);
    await svc.from("orders").delete().in("id", [v3Order, v4Order]);
    const { data: poLines } = await svc.from("purchase_order_lines").select("id").eq("purchase_order_id", poId);
    for (const l of poLines ?? []) {
      const { data: bs } = await svc.from("batches").select("id").eq("source_po_line_id", l.id);
      for (const b of bs ?? []) await svc.from("stock_movements").delete().eq("batch_id", b.id);
      await svc.from("batches").delete().eq("source_po_line_id", l.id);
    }
    await svc.from("purchase_orders").delete().eq("id", poId);
    await svc.from("products").delete().in("id", [invProductId, v3Product, v4Prod]);
    await svc.from("investor_deals").delete().eq("investor_id", v4Inv);
    await svc.from("investors").delete().eq("id", v4Inv);
    await svc.from("payments").delete().eq("invoice_id", invoiceKeep);
    await svc.from("invoices").delete().eq("customer_id", customerId);
    await svc.from("orders").delete().eq("customer_id", customerId);
    await svc.from("customers").delete().eq("id", customerId);
    for (const uid of createdUserIds) await svc.auth.admin.deleteUser(uid);
  } catch {
    /* ignore */
  }
});

describe("anon — B2 leak + zero write (highest priority)", () => {
  it("cannot read the base products table (REVOKE)", async () => {
    const { error } = await anon.from("products").select("id").limit(1);
    expect(error).toBeTruthy();
  });

  it("cannot read any B2 cost/margin/supplier/internal column via products_public", async () => {
    for (const col of [
      "cost_pkr",
      "cost_currency",
      "retail_price_sea_pkr",
      "total_end_cost_air_pkr",
      "total_end_cost_sea_pkr",
      "weight_kg",
      "supplier_id",
      "visibility",
      "reseller_price_pkr", // Phase 5 — internal trade pricing, never on the storefront
      "owner_kind", // Phase 4 — investor ownership is internal
      "investor_deal_id",
    ]) {
      const { error } = await anon.from("products_public").select(col).limit(1);
      expect(error, `products_public.${col} must not be selectable by anon`).toBeTruthy();
    }
  });

  it("CAN read the public product columns (sanity)", async () => {
    const { error } = await anon.from("products_public").select("id,name,price_pkr,parent_slug").limit(1);
    expect(error).toBeFalsy();
  });

  it("cannot read any internal table", async () => {
    for (const t of ["customers", "orders", "order_items", "invoices", "invoice_items", "payments", "profiles", "suppliers", "expenses", "audit_log", "sku_sequences",
                     "purchase_orders", "purchase_order_lines", "batches", "stock_movements",
                     "investors", "investor_deals", "investor_payouts", "planned_purchases",
                     "cash_marketing", "pr_gifts", "corrections", "refunds", "customer_deliveries",
                     "quotations", "quotation_items", "oneoff_products", "order_oneoff_deliveries",
                     "query_sheets", "query_sheet_rows"]) {
      await expectSelectDenied(anon, t);
    }
  });

  it("cannot read the financial views (revenue / balances / margins)", async () => {
    for (const v of ["invoice_balances", "analytics_daily", "category_sales", "order_cogs",
                     "investor_sale_accrual", "investor_owed", "sale_margin", "house_margin_daily", "pnl_summary",
                     "marketing_spend", "corrections_loss", "investor_product_pnl", "product_sales_pnl", "product_pnl", "purchase_line_detail",
                     "activity_days"]) {
      await expectSelectDenied(anon, v);
    }
  });

  it("cannot write ANY table", async () => {
    await expectInsertDenied(anon, "products", { sku: "x", category_id: catId, name: "x" });
    await expectInsertDenied(anon, "customers", { name: "x" });
    await expectInsertDenied(anon, "orders", { customer_id: customerId });
    await expectInsertDenied(anon, "invoices", { customer_id: customerId });
    await expectInsertDenied(anon, "payments", { invoice_id: invoiceKeep, amount_pkr: 1, method: "cash", kind: "payment" });
    await expectInsertDenied(anon, "expenses", { category: "operations", amount_pkr: 1 });
    await expectInsertDenied(anon, "refunds", { amount_pkr: 1, reason: "x" });
    await expectInsertDenied(anon, "customer_deliveries", { amount_pkr: 1 });
    await expectInsertDenied(anon, "blog_posts", { slug: `a${Date.now()}`, title: "x" });
    await expectInsertDenied(anon, "testimonials", { name: "x" });
    await expectInsertDenied(anon, "announcements", { message: "x" });
    await expectInsertDenied(anon, "categories", { slug: `a${Date.now()}`, name: "x" });
    await expectInsertDenied(anon, "suppliers", { name: "x" });
    await expectInsertDenied(anon, "quotations", { customer_id: customerId });
    await expectInsertDenied(anon, "query_sheets", { title: "x" });
  });

  it("cannot read or write the vendor advance ledger (internal)", async () => {
    await expectSelectDenied(anon, "vendor_accounts");
    await expectSelectDenied(anon, "vendor_advance_entries");
    await expectSelectDenied(anon, "vendor_advance_balances");
    await expectInsertDenied(anon, "vendor_advance_entries", {
      vendor_account_id: "00000000-0000-0000-0000-000000000000",
      kind: "topup",
      amount_pkr: 1,
    });
  });
});

describe("inventory & cost spine (Phase 2) — anon-deny + receive RPC + ledger immutability", () => {
  it("anon cannot read the inventory/cost tables or views", async () => {
    for (const t of [
      "purchase_orders", "purchase_order_lines", "batches", "stock_movements",
      "batch_on_hand", "product_inventory", "product_cost", "vendor_payables", "purchase_order_lines_costed",
    ]) {
      await expectSelectDenied(anon, t);
    }
  });

  it("anon cannot write the inventory tables", async () => {
    await expectInsertDenied(anon, "purchase_orders", { supplier_id: "00000000-0000-0000-0000-000000000000" });
    await expectInsertDenied(anon, "stock_movements", { batch_id: "00000000-0000-0000-0000-000000000000", kind: "sale", qty: 1 });
  });

  it("viewer cannot insert a stock movement (append-only; staff/admin only)", async () => {
    await expectInsertDenied(viewer.client, "stock_movements", { batch_id: "00000000-0000-0000-0000-000000000000", kind: "adjust_add", qty: 1 });
  });

  it("viewer CANNOT receive a PO line (receive RPC is staff/admin)", async () => {
    const { error } = await viewer.client.rpc("receive_po_line", { p_line_id: poLineId, p_qty: 1 });
    expect(error).toBeTruthy();
  });

  it("admin CAN receive a PO line — a cost-bearing batch appears with the frozen landed cost", async () => {
    const { data, error } = await admin.client.rpc("receive_po_line", { p_line_id: poLineId, p_qty: 5 });
    expect(error).toBeFalsy();
    expect(data).toBeTruthy(); // the new batch id
    const { data: batch } = await svc.from("batches").select("landed_cost_pkr, qty_received").eq("id", data as string).single();
    expect(Number(batch!.landed_cost_pkr)).toBe(36340); // 900 RMB × 40 + 340 shipping
    expect(batch!.qty_received).toBe(5);
  });

  it("stock movements are immutable — admin cannot UPDATE the receive row", async () => {
    const batchId = (await svc.from("batches").select("id").eq("source_po_line_id", poLineId).limit(1).single()).data!.id;
    const mv = (await svc.from("stock_movements").select("id, qty").eq("batch_id", batchId).eq("kind", "receive").single()).data!;
    await admin.client.from("stock_movements").update({ qty: 999 }).eq("id", mv.id);
    const after = (await svc.from("stock_movements").select("qty").eq("id", mv.id).single()).data!;
    expect(after.qty).toBe(mv.qty);
  });
});

describe("order fulfilment (Phase 3) — fulfil RPC authz + rollup + COGS", () => {
  it("viewer CANNOT fulfil a line (fulfil_order_line is staff/admin)", async () => {
    const { error } = await viewer.client.rpc("fulfil_order_line", { p_line_id: v3Line, p_qty: 1 });
    expect(error).toBeTruthy();
  });

  it("admin fulfils part of a line -> order rolls to partially_delivered; line qty_delivered advances", async () => {
    const { error } = await admin.client.rpc("fulfil_order_line", { p_line_id: v3Line, p_qty: 2 });
    expect(error).toBeFalsy();
    expect((await svc.from("orders").select("stage").eq("id", v3Order).single()).data!.stage).toBe("partially_delivered");
    expect((await svc.from("order_items").select("qty_delivered").eq("id", v3Line).single()).data!.qty_delivered).toBe(2);
  });

  it("admin fulfils the rest -> order rolls to delivered; COGS recorded at actual batch cost", async () => {
    const { error } = await admin.client.rpc("fulfil_order_line", { p_line_id: v3Line, p_qty: 3 });
    expect(error).toBeFalsy();
    expect((await svc.from("orders").select("stage").eq("id", v3Order).single()).data!.stage).toBe("delivered");
    const cogs = (await svc.from("order_cogs").select("qty_sold, cogs_pkr").eq("order_item_id", v3Line).single()).data!;
    expect(cogs.qty_sold).toBe(5);
    expect(Number(cogs.cogs_pkr)).toBe(25000); // 5 units × 5000 batch landed cost
  });

  it("cannot over-deliver a fully delivered line", async () => {
    const { error } = await admin.client.rpc("fulfil_order_line", { p_line_id: v3Line, p_qty: 1 });
    expect(error).toBeTruthy();
  });
});

describe("investor settlement (Phase 4) — payout authz + overpay guard + reversal", () => {
  // fixture investor is owed 30000 (capital 20000 + 50% profit-share 10000)
  it("the owed balance accrues from the delivered investor sale (specific-id capital + split profit)", async () => {
    const owed = (await svc.from("investor_owed").select("accrued_pkr, owed_pkr").eq("investor_id", v4Inv).single()).data!;
    expect(Number(owed.accrued_pkr)).toBe(30000);
    expect(Number(owed.owed_pkr)).toBe(30000);
  });

  it("viewer CANNOT record a payout (staff/admin only)", async () => {
    await expectInsertDenied(viewer.client, "investor_payouts", { investor_id: v4Inv, kind: "payout", amount_pkr: 1000 });
  });

  it("staff CAN record a payout within the owed balance", async () => {
    const { data, error } = await staff.client.from("investor_payouts").insert({ investor_id: v4Inv, kind: "payout", amount_pkr: 10000 }).select("id").single();
    expect(error).toBeFalsy();
    v4Payout = data!.id;
  });

  it("CANNOT pay out more than is owed (the guard) — total would exceed accrued", async () => {
    const { error } = await staff.client.from("investor_payouts").insert({ investor_id: v4Inv, kind: "payout", amount_pkr: 30000 });
    expect(error).toBeTruthy(); // 10000 already paid + 30000 = 40000 > 30000 owed
  });

  it("staff CANNOT post a reversal (admin-only)", async () => {
    const { error } = await staff.client.from("investor_payouts").insert({ investor_id: v4Inv, kind: "reversal", amount_pkr: 10000, reverses_id: v4Payout });
    expect(error).toBeTruthy();
  });

  it("admin CAN reverse a payout — the owed balance is restored", async () => {
    const before = Number((await svc.from("investor_owed").select("owed_pkr").eq("investor_id", v4Inv).single()).data!.owed_pkr);
    const { error } = await admin.client.from("investor_payouts").insert({ investor_id: v4Inv, kind: "reversal", amount_pkr: 10000, reverses_id: v4Payout });
    expect(error).toBeFalsy();
    const after = Number((await svc.from("investor_owed").select("owed_pkr").eq("investor_id", v4Inv).single()).data!.owed_pkr);
    expect(after).toBe(before + 10000); // the reversal un-pays
  });

  it("payouts are immutable — admin cannot UPDATE", async () => {
    await admin.client.from("investor_payouts").update({ amount_pkr: 999 }).eq("id", v4Payout);
    expect(Number((await svc.from("investor_payouts").select("amount_pkr").eq("id", v4Payout).single()).data!.amount_pkr)).toBe(10000);
  });
});

describe("procurement pipeline (Phase 6) — anon-deny + graduate authz/guards", () => {
  it("viewer cannot write a planned purchase (staff/admin only)", async () => {
    await expectInsertDenied(viewer.client, "planned_purchases", { item_name: "x" });
  });

  it("viewer CANNOT graduate a planned purchase", async () => {
    const { error } = await viewer.client.rpc("graduate_planned_purchase", { p_id: v6Plan });
    expect(error).toBeTruthy();
  });

  it("graduate is blocked when the plan has no linked catalogue product (free-text research)", async () => {
    const { error } = await admin.client.rpc("graduate_planned_purchase", { p_id: v6PlanFree });
    expect(error).toBeTruthy();
  });

  it("admin CAN graduate an approved, product+vendor-linked plan into a real PO", async () => {
    const { data, error } = await admin.client.rpc("graduate_planned_purchase", { p_id: v6Plan });
    expect(error).toBeFalsy();
    expect(data).toBeTruthy(); // the new PO id
    expect((await svc.from("purchase_orders").select("status").eq("id", data as string).single()).data!.status).toBe("ordered");
    const plan = (await svc.from("planned_purchases").select("status, graduated_to_po_id").eq("id", v6Plan).single()).data!;
    expect(plan.status).toBe("ordered");
    expect(plan.graduated_to_po_id).toBe(data);
    expect((await svc.from("purchase_order_lines").select("qty_ordered").eq("purchase_order_id", data as string).single()).data!.qty_ordered).toBe(3); // from planned_qty
  });

  it("cannot graduate an already-graduated plan", async () => {
    const { error } = await admin.client.rpc("graduate_planned_purchase", { p_id: v6Plan });
    expect(error).toBeTruthy();
  });
});

describe("marketing (Phase 8) — anon-deny, PR-gift house-only, authz, no double-count", () => {
  const giftArgs = (product: string, qty: number) => ({
    p_product_id: product, p_qty: qty, p_recipient: "X", p_platform: "IG", p_content_type: "reel",
    p_expected_reach: 1000, p_status: "sent" as const, p_notes: null, p_occurred_on: null,
  });

  it("viewer cannot write cash_marketing or pr_gifts", async () => {
    await expectInsertDenied(viewer.client, "cash_marketing", { amount_pkr: 100 });
    await expectInsertDenied(viewer.client, "pr_gifts", { product_id: v8Prod, qty: 1 });
  });

  it("viewer CANNOT record a PR gift", async () => {
    const { error } = await viewer.client.rpc("gift_pr", giftArgs(v8Prod, 1));
    expect(error).toBeTruthy();
  });

  it("PR-gifting an INVESTOR product is blocked (house stock only) — via the RPC", async () => {
    const { error } = await admin.client.rpc("gift_pr", giftArgs(v4Prod, 1));
    expect(error).toBeTruthy();
  });

  it("the DB guard blocks a pr_gift movement on investor stock even inserted directly", async () => {
    const { error } = await admin.client.from("stock_movements").insert({ batch_id: v4Batch, kind: "pr_gift", qty: 1 });
    expect(error).toBeTruthy();
  });

  it("admin CAN PR-gift a house product — cost flows to marketing, NOT to COGS/house margin", async () => {
    const before = Number((await svc.from("marketing_spend").select("pr_gift_pkr").single()).data!.pr_gift_pkr);
    const hmBefore = Number((await svc.from("pnl_summary").select("house_margin_pkr").single()).data!.house_margin_pkr);
    const { error } = await admin.client.rpc("gift_pr", giftArgs(v8Prod, 2));
    expect(error).toBeFalsy();
    const after = Number((await svc.from("marketing_spend").select("pr_gift_pkr").single()).data!.pr_gift_pkr);
    const hmAfter = Number((await svc.from("pnl_summary").select("house_margin_pkr").single()).data!.house_margin_pkr);
    expect(after).toBe(before + 2 * 4000); // 2 units × 4000 landed cost → marketing
    expect(hmAfter).toBe(hmBefore); // the gift never touches COGS / house margin
  });
});

describe("at-fault corrections (Phase 9) — anon-deny, RPC-only, refund admin-only, immutable, investor untouched", () => {
  it("viewer cannot insert a correction directly (RPC-only ledger)", async () => {
    await expectInsertDenied(viewer.client, "corrections", { order_id: v9Order, action: "compensation", amount_pkr: 100, reason: "x" });
  });

  it("viewer cannot record any correction via the RPC", async () => {
    const { error } = await viewer.client.rpc("record_correction", { p_order_id: v9Order, p_order_item_id: null, p_action: "compensation", p_amount_pkr: 100, p_product_id: null, p_qty: null, p_wrong_unit_disposition: null, p_payment_id: null, p_method: null, p_reason: "x", p_notes: null });
    expect(error).toBeTruthy();
  });

  it("staff can record a compensation but NOT a refund (refunds are admin-only)", async () => {
    const comp = await staff.client.rpc("record_correction", { p_order_id: v9Order, p_order_item_id: null, p_action: "compensation", p_amount_pkr: 500, p_product_id: null, p_qty: null, p_wrong_unit_disposition: null, p_payment_id: null, p_method: null, p_reason: "goodwill", p_notes: null });
    expect(comp.error).toBeFalsy();
    const ref = await staff.client.rpc("record_correction", { p_order_id: v9Order, p_order_item_id: null, p_action: "refund", p_amount_pkr: 500, p_product_id: null, p_qty: null, p_wrong_unit_disposition: null, p_payment_id: v9Payment, p_method: "cash", p_reason: "refund", p_notes: null });
    expect(ref.error).toBeTruthy();
  });

  it("admin can record a refund — posts a payment reversal that nets the invoice", async () => {
    const before = Number((await svc.from("invoice_balances").select("paid_pkr").eq("invoice_id", v9Invoice).single()).data!.paid_pkr);
    const { data, error } = await admin.client.rpc("record_correction", { p_order_id: v9Order, p_order_item_id: null, p_action: "refund", p_amount_pkr: 1000, p_product_id: null, p_qty: null, p_wrong_unit_disposition: null, p_payment_id: v9Payment, p_method: "cash", p_reason: "refund", p_notes: null });
    expect(error).toBeFalsy();
    v9Corr = (data as { id: string }).id;
    const after = Number((await svc.from("invoice_balances").select("paid_pkr").eq("invoice_id", v9Invoice).single()).data!.paid_pkr);
    expect(after).toBe(before - 1000); // the reversal netted the paid amount
  });

  it("the corrections ledger is immutable — admin cannot UPDATE or DELETE a correction", async () => {
    await admin.client.from("corrections").update({ reason: "changed" }).eq("id", v9Corr!);
    expect((await svc.from("corrections").select("reason").eq("id", v9Corr!).single()).data!.reason).toBe("refund");
    await admin.client.from("corrections").delete().eq("id", v9Corr!);
    expect((await svc.from("corrections").select("id").eq("id", v9Corr!).maybeSingle()).data).toBeTruthy();
  });

  it("a replacement of an INVESTOR product is blocked (house stock only)", async () => {
    const { error } = await admin.client.rpc("record_correction", { p_order_id: v9Order, p_order_item_id: null, p_action: "replacement", p_amount_pkr: null, p_product_id: v4Prod, p_qty: 1, p_wrong_unit_disposition: "written_off", p_payment_id: null, p_method: null, p_reason: "wrong item", p_notes: null });
    expect(error).toBeTruthy();
  });

  it("an at-fault correction on an investor item leaves investor settlement UNCHANGED (house absorbs)", async () => {
    const before = Number((await svc.from("investor_owed").select("owed_pkr").eq("investor_id", v4Inv).single()).data!.owed_pkr);
    const { error } = await admin.client.rpc("record_correction", { p_order_id: v4Order, p_order_item_id: null, p_action: "compensation", p_amount_pkr: 5000, p_product_id: null, p_qty: null, p_wrong_unit_disposition: null, p_payment_id: null, p_method: null, p_reason: "goodwill on investor item", p_notes: null });
    expect(error).toBeFalsy();
    const after = Number((await svc.from("investor_owed").select("owed_pkr").eq("investor_id", v4Inv).single()).data!.owed_pkr);
    expect(after).toBe(before); // the investor's accrual is never touched by a correction
  });
});

describe("operating expenses (Phase 10) — opex-only ledger", () => {
  it("staff can log an OPERATING expense (rent) but NOT inventory/shipping (those are COGS)", async () => {
    const ok = await staff.client.from("expenses").insert({ category: "rent", amount_pkr: 1000, spent_on: "2026-01-01", note: "RLS-P10-opex" });
    expect(ok.error).toBeFalsy();
    const inv = await staff.client.from("expenses").insert({ category: "inventory", amount_pkr: 1000, spent_on: "2026-01-01", note: "RLS-P10-opex" });
    expect(inv.error).toBeTruthy(); // expenses_opex_only CHECK — inventory is COGS, not an expense
    const ship = await staff.client.from("expenses").insert({ category: "shipping", amount_pkr: 1000, spent_on: "2026-01-01", note: "RLS-P10-opex" });
    expect(ship.error).toBeTruthy();
  });
});

describe("refunds tracker (standalone) — anon/viewer deny, staff write", () => {
  it("viewer CANNOT log a refund (staff/admin only)", async () => {
    await expectInsertDenied(viewer.client, "refunds", { amount_pkr: 500, reason: "RLS-refund-probe" });
  });

  it("staff CAN log a refund with a mandatory note", async () => {
    const { error } = await staff.client.from("refunds").insert({ amount_pkr: 500, deduction_cycle: "next", reason: "RLS-refund-probe" });
    expect(error).toBeFalsy();
  });

  it("a note-less refund is rejected (mandatory audit note CHECK)", async () => {
    const { error } = await staff.client.from("refunds").insert({ amount_pkr: 500, reason: "   " });
    expect(error).toBeTruthy();
  });

  it("refunds are immutable — staff cannot UPDATE or DELETE (090124)", async () => {
    const { data: ins } = await staff.client.from("refunds").insert({ amount_pkr: 700, reason: "RLS-refund-immut" }).select("id").single();
    const id = ins!.id as string;
    await staff.client.from("refunds").update({ amount_pkr: 999999 }).eq("id", id);
    await staff.client.from("refunds").delete().eq("id", id);
    const { data } = await svc.from("refunds").select("amount_pkr").eq("id", id).single();
    expect(Number(data!.amount_pkr), "amount unchanged").toBe(700);
    expect(await rowExists("refunds", id), "row survives").toBe(true);
  });

  it("a mistake is corrected by a signed reversal (staff)", async () => {
    const { data: ins } = await staff.client.from("refunds").insert({ amount_pkr: 400, reason: "RLS-refund-rev" }).select("id, refunded_on, deduction_cycle").single();
    const o = ins!;
    const { error } = await staff.client.from("refunds").insert({ amount_pkr: -400, reason: "Reversal", refunded_on: o.refunded_on, deduction_cycle: o.deduction_cycle, reverses_id: o.id });
    expect(error).toBeFalsy();
  });

  it("a reversal with the wrong amount is rejected (guard)", async () => {
    const { data: ins } = await staff.client.from("refunds").insert({ amount_pkr: 400, reason: "RLS-refund-badrev" }).select("id").single();
    const { error } = await staff.client.from("refunds").insert({ amount_pkr: -300, reason: "bad", reverses_id: ins!.id });
    expect(error).toBeTruthy();
  });

  it("an entry cannot be reversed twice (unique reverses_id)", async () => {
    const { data: ins } = await staff.client.from("refunds").insert({ amount_pkr: 400, reason: "RLS-refund-dbl" }).select("id").single();
    const id = ins!.id as string;
    await staff.client.from("refunds").insert({ amount_pkr: -400, reason: "r1", reverses_id: id });
    const { error } = await staff.client.from("refunds").insert({ amount_pkr: -400, reason: "r2", reverses_id: id });
    expect(error).toBeTruthy();
  });
});

describe("customer delivery costs — anon/viewer deny, staff write", () => {
  it("viewer CANNOT log a delivery cost (staff/admin only)", async () => {
    await expectInsertDenied(viewer.client, "customer_deliveries", { amount_pkr: 300, courier: "RLS-delivery-probe" });
  });

  it("staff CAN log a delivery cost (owed by default)", async () => {
    const { error } = await staff.client.from("customer_deliveries").insert({ amount_pkr: 300, courier: "RLS-delivery-probe" });
    expect(error).toBeFalsy();
  });

  it("deliveries are immutable — staff cannot UPDATE or DELETE (090124)", async () => {
    const { data: ins } = await staff.client.from("customer_deliveries").insert({ amount_pkr: 300, courier: "RLS-del-immut" }).select("id").single();
    const id = ins!.id as string;
    await staff.client.from("customer_deliveries").update({ amount_pkr: 999999 }).eq("id", id);
    await staff.client.from("customer_deliveries").delete().eq("id", id);
    const { data } = await svc.from("customer_deliveries").select("amount_pkr").eq("id", id).single();
    expect(Number(data!.amount_pkr), "amount unchanged").toBe(300);
    expect(await rowExists("customer_deliveries", id), "row survives").toBe(true);
  });

  it("owed → paid only via mark_delivery_paid (viewer denied; staff one-way)", async () => {
    const { data: ins } = await staff.client.from("customer_deliveries").insert({ amount_pkr: 300, courier: "RLS-del-paid" }).select("id").single();
    const id = ins!.id as string;
    await expectRpcDenied(viewer.client, "mark_delivery_paid", { p_id: id });
    const { error } = await staff.client.rpc("mark_delivery_paid", { p_id: id });
    expect(error, "staff can mark it paid").toBeFalsy();
    const { data } = await svc.from("customer_deliveries").select("paid_on").eq("id", id).single();
    expect(data!.paid_on, "paid_on stamped").toBeTruthy();
  });

  it("a delivery mistake is corrected by a signed reversal", async () => {
    const { data: ins } = await staff.client.from("customer_deliveries").insert({ amount_pkr: 300, courier: "RLS-del-rev" }).select("id, billed_on").single();
    const o = ins!;
    const { error } = await staff.client.from("customer_deliveries").insert({ amount_pkr: -300, billed_on: o.billed_on, note: "Reversal", reverses_id: o.id });
    expect(error).toBeFalsy();
  });
});

describe("cash marketing — immutable ledger (create + reverse only, 090124)", () => {
  it("staff cannot UPDATE or DELETE a cash-marketing row", async () => {
    const { data: ins } = await staff.client.from("cash_marketing").insert({ kind: "paid_promo", amount_pkr: 250, note: "RLS-cash-immut" }).select("id").single();
    const id = ins!.id as string;
    await staff.client.from("cash_marketing").update({ amount_pkr: 999999 }).eq("id", id);
    await staff.client.from("cash_marketing").delete().eq("id", id);
    const { data } = await svc.from("cash_marketing").select("amount_pkr").eq("id", id).single();
    expect(Number(data!.amount_pkr), "amount unchanged").toBe(250);
    expect(await rowExists("cash_marketing", id), "row survives").toBe(true);
  });
  it("a signed reversal nets it out", async () => {
    const { data: ins } = await staff.client.from("cash_marketing").insert({ kind: "paid_promo", amount_pkr: 250, note: "RLS-cash-rev" }).select("id").single();
    const { error } = await staff.client.from("cash_marketing").insert({ kind: "paid_promo", amount_pkr: -250, note: "Reversal", reverses_id: ins!.id });
    expect(error).toBeFalsy();
  });
});

describe("PO-line payment guard — payment columns only via record_po_payment (090125)", () => {
  async function freshLine() {
    return (await svc.from("purchase_order_lines").insert({ purchase_order_id: poId, product_id: invProductId, qty_ordered: 4, unit_cost_rmb: 100, shipping_per_unit_pkr: 50 }).select("id").single()).data!.id as string;
  }
  it("a direct UPDATE of a payment column is rejected", async () => {
    const line = await freshLine();
    const { error } = await staff.client.from("purchase_order_lines").update({ item_paid_amount_pkr: 5000, item_paid_on: "2026-01-01" }).eq("id", line);
    expect(error, "guard rejects a raw payment-column write").toBeTruthy();
    const { data } = await svc.from("purchase_order_lines").select("item_paid_amount_pkr").eq("id", line).single();
    expect(data!.item_paid_amount_pkr, "nothing was written").toBeNull();
  });
  it("non-payment edits still work; record_po_payment settles legitimately", async () => {
    const line = await freshLine();
    const nonPay = await staff.client.from("purchase_order_lines").update({ shipping_per_unit_pkr: 60 }).eq("id", line);
    expect(nonPay.error, "non-payment edits are unaffected").toBeFalsy();
    const { error } = await staff.client.rpc("record_po_payment", { p_line_id: line, p_kind: "ship", p_amount: 240, p_use_credit: false, p_occurred_on: "2026-01-01" });
    expect(error, "record_po_payment can write the payment columns").toBeFalsy();
    const { data } = await svc.from("purchase_order_lines").select("ship_paid_amount_pkr").eq("id", line).single();
    expect(Number(data!.ship_paid_amount_pkr), "line settled through the RPC").toBeGreaterThan(0);
  });
});

// Query sheets are the ONE internal table staff/viewer cannot even READ: a rough sheet carries
// acquisition cost and margin, so it is admin-only on both sides (migration 090110).
describe("query sheets — admin-only on read AND write", () => {
  it("viewer CANNOT read query sheets", async () => {
    await expectSelectEmpty(viewer.client, "query_sheets");
  });

  it("staff CANNOT read query sheets (unlike every other internal table)", async () => {
    await expectSelectEmpty(staff.client, "query_sheets");
  });

  it("staff CANNOT create a query sheet", async () => {
    await expectInsertDenied(staff.client, "query_sheets", { title: "RLS-query-probe" });
  });

  it("admin CAN create a query sheet and add a row to it", async () => {
    const { data, error } = await admin.client.from("query_sheets").insert({ title: "RLS-query-probe" }).select("id").single();
    expect(error).toBeFalsy();
    const { error: rowErr } = await admin.client
      .from("query_sheet_rows")
      .insert({ sheet_id: data!.id, position: 0, cells: { name: "probe", qty: 2 } });
    expect(rowErr).toBeFalsy();
    await admin.client.from("query_sheets").delete().eq("id", data!.id);
  });
});

describe("viewer — read-only", () => {
  it("can read internal tables (sanity)", async () => {
    const { error } = await viewer.client.from("orders").select("id").limit(1);
    expect(error).toBeFalsy();
  });

  it("cannot read the staff-only audit_log (RLS filters to empty)", async () => {
    const { data, error } = await viewer.client.from("audit_log").select("*").limit(5);
    expect(error).toBeFalsy();
    expect(data?.length ?? 0).toBe(0);
  });

  it("cannot insert into internal tables", async () => {
    await expectInsertDenied(viewer.client, "orders", { customer_id: customerId });
    await expectInsertDenied(viewer.client, "products", { sku: "x", category_id: catId, name: "x" });
    await expectInsertDenied(viewer.client, "customers", { name: "x" });
    await expectInsertDenied(viewer.client, "expenses", { category: "operations", amount_pkr: 1 });
    await expectInsertDenied(viewer.client, "blog_posts", { slug: `v${Date.now()}`, title: "x" });
  });

  it("cannot delete an order (RLS) — the order survives", async () => {
    await viewer.client.from("orders").delete().eq("id", orderKeep);
    expect(await rowExists("orders", orderKeep)).toBe(true);
  });
});

describe("staff — write, but no reversals / admin deletes", () => {
  it("CAN insert a payment within balance (sanity)", async () => {
    const { error } = await staff.client
      .from("payments")
      .insert({ invoice_id: invoiceKeep, amount_pkr: 100, method: "cash", kind: "payment" });
    expect(error).toBeFalsy();
  });

  it("CANNOT insert a reversal (admin-only)", async () => {
    const { error } = await staff.client.from("payments").insert({
      invoice_id: invoiceKeep,
      amount_pkr: 50,
      method: "cash",
      kind: "reversal",
      reverses_payment_id: paymentKeep,
    });
    expect(error).toBeTruthy();
  });

  it("CANNOT delete an invoice — the invoice survives", async () => {
    await staff.client.from("invoices").delete().eq("id", invoiceDel);
    expect(await rowExists("invoices", invoiceDel)).toBe(true);
  });

  it("CANNOT delete an order — the order survives", async () => {
    await staff.client.from("orders").delete().eq("id", orderKeep);
    expect(await rowExists("orders", orderKeep)).toBe(true);
  });

  it("CANNOT publish a body-less blog post (DB CHECK)", async () => {
    const { error } = await staff.client
      .from("blog_posts")
      .insert({ slug: `empty-${Date.now()}`, title: "x", published: true });
    expect(error).toBeTruthy();
  });

  it("CAN read the audit_log (staff+)", async () => {
    const { data, error } = await staff.client.from("audit_log").select("*").limit(5);
    expect(error).toBeFalsy();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("payments immutability — no UPDATE/DELETE for anyone (incl. admin)", () => {
  it("admin cannot UPDATE a payment — the amount is unchanged", async () => {
    await admin.client.from("payments").update({ amount_pkr: 999999 }).eq("id", paymentKeep);
    const { data } = await svc.from("payments").select("amount_pkr").eq("id", paymentKeep).single();
    expect(Number(data!.amount_pkr)).toBe(100);
  });

  it("admin cannot DELETE a payment — the payment survives", async () => {
    await admin.client.from("payments").delete().eq("id", paymentKeep);
    expect(await rowExists("payments", paymentKeep)).toBe(true);
  });
});

describe("invoice delete — admin-only + FK RESTRICT", () => {
  it("admin CANNOT delete an invoice that has payments (RESTRICT)", async () => {
    const { error } = await admin.client.from("invoices").delete().eq("id", invoiceKeep);
    expect(error).toBeTruthy();
    expect(await rowExists("invoices", invoiceKeep)).toBe(true);
  });

  it("admin CAN delete an invoice with no payments (positive)", async () => {
    await admin.client.from("invoices").delete().eq("id", invoiceDel);
    expect(await rowExists("invoices", invoiceDel)).toBe(false);
  });

  it("admin CAN delete an order (positive)", async () => {
    await admin.client.from("orders").delete().eq("id", orderDel);
    expect(await rowExists("orders", orderDel)).toBe(false);
  });
});

describe("stale JWT — has_role reads profiles, not the claim", () => {
  it("a demoted admin's old token cannot perform an admin delete", async () => {
    const stale = await makeUser("admin");
    // The token was minted while admin; the claim still says admin.
    const token = (await stale.client.auth.getSession()).data.session!.access_token;
    const claim = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()).user_role;
    expect(claim).toBe("admin");
    // Demote AFTER the token was issued.
    await svc.from("profiles").update({ role: "viewer" }).eq("id", stale.uid);
    // has_role() reads profiles (now viewer) → the admin-only delete is denied.
    await stale.client.from("orders").delete().eq("id", orderKeep);
    expect(await rowExists("orders", orderKeep)).toBe(true);
  });
});

describe("storage write authorization (buckets are public-read, staff/admin-write)", () => {
  it("anon cannot upload to product-images", async () => {
    const { error } = await anon.storage.from("product-images").upload(`rls/anon-${Date.now()}.png`, PNG, { contentType: "image/png" });
    expect(error).toBeTruthy();
  });

  it("viewer cannot upload to blog-images", async () => {
    const { error } = await viewer.client.storage.from("blog-images").upload(`rls/viewer-${Date.now()}.png`, PNG, { contentType: "image/png" });
    expect(error).toBeTruthy();
  });

  it("staff CAN upload to product-images (positive)", async () => {
    const { error } = await staff.client.storage.from("product-images").upload(`rls/staff-${Date.now()}.png`, PNG, { contentType: "image/png" });
    expect(error).toBeFalsy();
  });

  it("admin CAN upload to blog-images (positive)", async () => {
    const { error } = await admin.client.storage.from("blog-images").upload(`rls/admin-${Date.now()}.png`, PNG, { contentType: "image/png" });
    expect(error).toBeFalsy();
  });

  it("expense-receipts is PRIVATE — anon cannot upload", async () => {
    const { error } = await anon.storage.from("expense-receipts").upload(`rls/anon-${Date.now()}.png`, PNG, { contentType: "image/png" });
    expect(error).toBeTruthy();
  });

  it("staff CAN upload a receipt, but anon + viewer CANNOT read it (private financial doc)", async () => {
    const key = `rls/staff-${Date.now()}.png`;
    const up = await staff.client.storage.from("expense-receipts").upload(key, PNG, { contentType: "image/png" });
    expect(up.error).toBeFalsy();
    expect((await anon.storage.from("expense-receipts").download(key)).error).toBeTruthy();
    expect((await viewer.client.storage.from("expense-receipts").download(key)).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// Invoice editing (update_invoice, migration 090083). Issued invoices are otherwise immutable, so
// the escape hatch is gated to the ONLY window where an edit cannot corrupt the money: admin, not
// voided, and NO payments. The paid-invoice case is the one that matters — guard_payment_overpay
// only fires on payment INSERT, so an edit that drops a paid invoice's total below what was already
// paid would leave it silently over-paid. These assertions are what stop that from regressing.
// ---------------------------------------------------------------------------------------------
describe("invoice editing — admin-only, unpaid-only (090083)", () => {
  const line = (qty: number) => [{ product_id: invProductId, qty }];

  it("staff cannot edit an invoice (admin-only)", async () => {
    const inv = (await svc.from("invoices").insert({ customer_id: customerId, total_pkr: 1000 }).select("id").single()).data!.id;
    const { error } = await staff.client.rpc("update_invoice", { p_id: inv, p_items: line(1) });
    expect(error, "staff must not be able to edit an invoice").toBeTruthy();
    expect(error!.message).toMatch(/only an admin/i);
  });

  it("admin CANNOT edit an invoice that already has a payment — reverse it first", async () => {
    // invoiceKeep carries paymentKeep. Editing it down would silently over-pay it.
    const { error } = await admin.client.rpc("update_invoice", { p_id: invoiceKeep, p_items: line(1) });
    expect(error, "a paid invoice must be frozen against edits").toBeTruthy();
    expect(error!.message).toMatch(/payments recorded/i);
  });

  it("admin CAN edit an unpaid invoice, and the total is recomputed server-side", async () => {
    const inv = (await svc.from("invoices").insert({ customer_id: customerId, total_pkr: 0 }).select("id").single()).data!.id;
    await svc.from("products").update({ price_pkr: 1000 }).eq("id", invProductId);

    const { error } = await admin.client.rpc("update_invoice", { p_id: inv, p_items: line(3) });
    expect(error, error?.message).toBeNull();

    // The client does not get to set the total: 3 x 1000, tax applied from settings.
    const row = (await svc.from("invoices").select("subtotal_pkr, total_pkr").eq("id", inv).single()).data!;
    expect(Number(row.subtotal_pkr)).toBe(3000);
    expect(Number(row.total_pkr)).toBeGreaterThanOrEqual(3000);
  });

  it("admin cannot edit a VOIDED invoice", async () => {
    const inv = (await svc.from("invoices").insert({ customer_id: customerId, total_pkr: 0 }).select("id").single()).data!.id;
    await svc.from("invoices").update({ voided_at: new Date().toISOString() }).eq("id", inv);
    const { error } = await admin.client.rpc("update_invoice", { p_id: inv, p_items: line(1) });
    expect(error, "a voided invoice must be frozen").toBeTruthy();
    expect(error!.message).toMatch(/voided/i);
  });
});

// Fix Group 1 — grant hardening (C1 + M5). Runs last so every fixture (payouts, the receive-row
// stock movement) already exists.
// ---------------------------------------------------------------------------------------------
describe("grant hardening (C1 + M5) — anon cannot execute internal RPCs; ledgers un-deletable", () => {
  // C1: Supabase's ALTER DEFAULT PRIVILEGES granted EXECUTE on EVERY public function to anon, so
  // anon could POST /rest/v1/rpc/draw_stock_fifo and mutate the append-only stock ledger (→ corrupt
  // COGS / P&L). Migration 20260622090053 revokes it. This is the assertion that would have caught C1.
  it("anon cannot execute draw_stock_fifo — the C1 exploit, with a VALID signature", async () => {
    // Pre-fix this EXECUTED and returned a business error (23514 "not enough stock") — the smoking
    // gun that anon reached the ledger. Post-fix it's a 42501 permission-denied before the body runs.
    await expectRpcDenied(anon, "draw_stock_fifo", {
      p_product_id: "00000000-0000-0000-0000-000000000000",
      p_qty: 1,
      p_kind: "sale",
      p_order_item_id: null,
      p_pr_gift_id: null,
      p_correction_id: null,
      p_occurred_on: "2026-01-01",
      p_note: "rls-probe",
    });
  });

  it("anon cannot execute any internal / money-path RPC", async () => {
    for (const fn of [
      "fulfil_order_line", "gift_pr", "record_correction",
      "create_order", "create_invoice", "void_invoice", "update_invoice",
      "receive_po_line", "graduate_planned_purchase", "record_po_payment",
      "next_product_sku", "unique_product_slug", "has_role",
    ]) {
      await expectRpcDenied(anon, fn);
    }
  });

  // M5: authenticated held ALL — including TRUNCATE, which BYPASSES RLS — on every table, i.e. a
  // one-statement wipe of the immutable ledgers. 090053 revokes TRUNCATE + UPDATE/DELETE from the
  // app roles on the ledgers. TRUNCATE has no PostgREST verb, so it's enforced purely at the grant
  // layer (verified live in the migration); the API-reachable equivalent is DELETE, asserted here
  // (payments + corrections DELETE-deny already live in their own blocks above).
  it("admin cannot DELETE a stock movement (append-only ledger)", async () => {
    const batchId = (await svc.from("batches").select("id").eq("source_po_line_id", poLineId).limit(1).single()).data!.id;
    const mv = (await svc.from("stock_movements").select("id").eq("batch_id", batchId).eq("kind", "receive").single()).data!;
    await admin.client.from("stock_movements").delete().eq("id", mv.id);
    expect(await rowExists("stock_movements", mv.id), "stock movement must survive an admin delete").toBe(true);
  });

  it("admin cannot DELETE an investor payout (append-only ledger)", async () => {
    await admin.client.from("investor_payouts").delete().eq("id", v4Payout);
    expect(await rowExists("investor_payouts", v4Payout), "investor payout must survive an admin delete").toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Fix Group 2 — order/sale immutability (H1 freeze + H2 order-delete guard + H3 sale-reversal).
// Once a line has DRAWN STOCK, its realized terms freeze and it can't be erased; the undelivered
// remainder stays fulfillable and un-drawn lines stay editable.
// ---------------------------------------------------------------------------------------------
describe("order/sale immutability (Fix Group 2) — freeze drawn lines, block sold-order delete, forbid sale reversal", () => {
  it("H1: staff CANNOT change the price of a line that has drawn stock (freeze)", async () => {
    const { error } = await staff.client.from("order_items").update({ price_pkr: 99999 }).eq("id", fg2DrawnLine);
    expect(error, "price edit on a drawn line must be blocked").toBeTruthy();
    const after = (await svc.from("order_items").select("price_pkr").eq("id", fg2DrawnLine).single()).data!;
    expect(Number(after.price_pkr)).toBe(1000); // unchanged
  });

  it("H1: staff CANNOT reduce qty below what is already delivered", async () => {
    const { error } = await staff.client.from("order_items").update({ qty: 3 }).eq("id", fg2DrawnLine);
    expect(error, "reducing qty below qty_delivered must be blocked").toBeTruthy();
  });

  it("H1: staff CANNOT change the product of a drawn line (fixes owner/investor split)", async () => {
    const { error } = await staff.client.from("order_items").update({ product_id: v4Prod }).eq("id", fg2DrawnLine);
    expect(error, "changing product_id on a drawn line must be blocked").toBeTruthy();
    const after = (await svc.from("order_items").select("product_id").eq("id", fg2DrawnLine).single()).data!;
    expect(after.product_id).toBe(fg2Prod); // unchanged
  });

  it("H1: staff CANNOT reduce qty_delivered on a drawn line (would allow re-drawing the units)", async () => {
    const { error } = await staff.client.from("order_items").update({ qty_delivered: 0 }).eq("id", fg2DrawnLine);
    expect(error, "reducing qty_delivered on a drawn line must be blocked").toBeTruthy();
    const after = (await svc.from("order_items").select("qty_delivered").eq("id", fg2DrawnLine).single()).data!;
    expect(after.qty_delivered).toBe(5); // unchanged
  });

  it("H1: staff CANNOT re-attribute a drawn line to a different order", async () => {
    const { error } = await staff.client.from("order_items").update({ order_id: fg2BareOrder }).eq("id", fg2DrawnLine);
    expect(error, "moving a drawn line to another order must be blocked").toBeTruthy();
    const after = (await svc.from("order_items").select("order_id").eq("id", fg2DrawnLine).single()).data!;
    expect(after.order_id).toBe(fg2Order); // unchanged
  });

  it("H1: staff CAN still edit an UN-drawn line (un-fulfilled orders stay editable)", async () => {
    const { error } = await staff.client.from("order_items").update({ price_pkr: 650 }).eq("id", fg2UndrawnLine);
    expect(error, "editing an un-drawn line must be allowed").toBeFalsy();
    const after = (await svc.from("order_items").select("price_pkr").eq("id", fg2UndrawnLine).single()).data!;
    expect(Number(after.price_pkr)).toBe(650);
  });

  it("H1: admin CANNOT delete a line that has drawn stock (would orphan the sale)", async () => {
    await admin.client.from("order_items").delete().eq("id", fg2DrawnLine);
    expect(await rowExists("order_items", fg2DrawnLine), "a drawn line must survive delete").toBe(true);
  });

  it("H1: staff CAN delete an un-drawn line", async () => {
    await staff.client.from("order_items").delete().eq("id", fg2UndrawnLine);
    expect(await rowExists("order_items", fg2UndrawnLine), "an un-drawn line is deletable").toBe(false);
  });

  it("H2: admin CANNOT delete an order that has sales (soft-cancel instead)", async () => {
    await admin.client.from("orders").delete().eq("id", fg2Order);
    expect(await rowExists("orders", fg2Order), "a sold order must survive delete").toBe(true);
  });

  it("H2: a sold order CAN be soft-cancelled (stage='cancelled') with its realized sale preserved", async () => {
    const { error } = await staff.client.from("orders").update({ stage: "cancelled" }).eq("id", fg2Order);
    expect(error, "soft-cancel must be allowed").toBeFalsy();
    const sm = await svc.from("sale_margin").select("revenue_pkr").eq("order_item_id", fg2DrawnLine).maybeSingle();
    expect(sm.data, "the sale must still be in sale_margin after cancel").toBeTruthy();
    expect(Number(sm.data!.revenue_pkr)).toBe(5000); // 5 delivered × 1000 — not erased
  });

  it("H2: admin CAN delete a bare order (no sales)", async () => {
    await admin.client.from("orders").delete().eq("id", fg2BareOrder);
    expect(await rowExists("orders", fg2BareOrder), "a bare order is deletable").toBe(false);
  });

  it("H3: admin CANNOT reverse a sale movement (unwinds route through the at-fault ledger)", async () => {
    const { error } = await admin.client.from("stock_movements").insert({
      batch_id: fg2Batch, kind: "reversal", qty: 5, reverses_id: fg2SaleMv, occurred_on: "2026-01-01",
    });
    expect(error, "reversing a sale movement must be blocked").toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// Fix Group 3 — C3 (snapshot the sale economics) + C4 (row-lock the over-limit guards).
// Runs last; reuses the v4 investor sale (deal 0.5, sale of 4 @ 10000 -> accrued 30000, frozen
// onto the movement at insert time by the snapshot trigger).
// ---------------------------------------------------------------------------------------------
describe("sale-economics snapshot (Fix Group 3 / C3) — post-sale edits do not restate history", () => {
  it("C3: editing a deal's split_pct does NOT restate a past investor sale (snapshot freeze)", async () => {
    const accrued = async () =>
      Number((await svc.from("investor_owed").select("accrued_pkr").eq("investor_id", v4Inv).single()).data!.accrued_pkr);
    const before = await accrued();
    // A live edit that, pre-C3, retroactively rewrote every past sale's investor accrual.
    const { error } = await admin.client.from("investor_deals").update({ split_pct: 0.9 }).eq("id", v4Deal);
    expect(error, "admin can edit a deal").toBeFalsy();
    expect(await accrued(), "the past sale's accrual must be frozen against the split edit").toBe(before);
    // restore so nothing downstream is surprised
    await svc.from("investor_deals").update({ split_pct: 0.5 }).eq("id", v4Deal);
  });

  it("C3: investor_deals edits are now AUDITED (split_pct was previously unaudited)", async () => {
    await admin.client.from("investor_deals").update({ split_pct: 0.5 }).eq("id", v4Deal); // an admin write -> auth.uid present
    const { data } = await svc.from("audit_log").select("id").eq("entity_type", "investor_deals").eq("entity_id", v4Deal).limit(1);
    expect((data ?? []).length, "an investor_deals edit must land in audit_log").toBeGreaterThan(0);
  });
});

describe("over-limit guards serialize (Fix Group 3 / C4) — real concurrent transactions", () => {
  it("two concurrent sales of the LAST unit: one commits, the other is rejected (no oversell)", async () => {
    // fixture: a house product whose batch holds exactly ONE unit, plus an order line to attribute to.
    const stamp = Date.now();
    const prod = (await svc.from("products").insert({ sku: `RLS-C4-${stamp}`, category_id: catId, name: "RLS C4", made_to_order: false }).select("id").single()).data!.id;
    const poLine = (await svc.from("purchase_order_lines").insert({ purchase_order_id: poId, product_id: prod, qty_ordered: 1, unit_cost_rmb: 1 }).select("id").single()).data!.id;
    const batch = (await svc.from("batches").insert({ product_id: prod, source_po_line_id: poLine, qty_received: 1, landed_cost_pkr: 100, received_on: "2026-01-01" }).select("id").single()).data!.id;
    await svc.from("stock_movements").insert({ batch_id: batch, kind: "receive", qty: 1, occurred_on: "2026-01-01" });
    const order = (await svc.from("orders").insert({ customer_id: customerId }).select("id").single()).data!.id;
    const line = (await svc.from("order_items").insert({ order_id: order, product_id: prod, name: "c4", qty: 2, price_pkr: 500 }).select("id").single()).data!.id;

    const a = new pg.Client({ connectionString: DB_URL });
    const b = new pg.Client({ connectionString: DB_URL });
    await a.connect();
    await b.connect();
    let bRejected = false;
    try {
      const ins = `insert into stock_movements(batch_id, kind, qty, order_item_id, occurred_on) values ('${batch}','sale',1,'${line}',current_date)`;
      await a.query("begin");
      await b.query("begin");
      await a.query(ins); // A passes the guard and holds the batch row lock (FOR UPDATE)
      const bInsert = b.query(ins).catch((e) => { bRejected = true; return e; }); // B blocks on the batch lock
      await new Promise((r) => setTimeout(r, 400));
      await a.query("commit"); // A commits -> the last unit is gone
      await bInsert; // B unblocks, re-reads remaining=0, guard rejects it
      await b.query("commit").catch(() => {});
    } finally {
      await a.end().catch(() => {});
      await b.end().catch(() => {});
    }

    expect(bRejected, "the second concurrent sale of the last unit must be rejected (guard serialized)").toBe(true);
    const sales = (await svc.from("stock_movements").select("id").eq("batch_id", batch).eq("kind", "sale")).data ?? [];
    expect(sales.length, "exactly one sale may commit — no oversell").toBe(1);

    // cleanup
    await svc.from("stock_movements").delete().eq("batch_id", batch);
    await svc.from("orders").delete().eq("id", order);
    await svc.from("batches").delete().eq("product_id", prod);
    await svc.from("purchase_order_lines").delete().eq("product_id", prod);
    await svc.from("products").delete().eq("id", prod);
  });
});
