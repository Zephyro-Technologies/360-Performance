-- ===========================================================================
-- 360 Performance — anon privilege hardening (Phase 7, defense-in-depth)
--
-- Supabase's default privileges GRANT anon ALL on every new public table/view.
-- Only `products` was revoked before, so anon held a (RLS-masked) table grant on
-- every internal table — and, more seriously, on the SECURITY-DEFINER financial
-- views: anon could SELECT analytics_daily / invoice_balances / category_sales and
-- read revenue, balances and margins, bypassing RLS entirely (the views run with
-- their owner's rights). Reads were only ever saved by RLS returning 0 rows; the
-- views had no such backstop.
--
-- anon (the public website) must hold NO privileges on internal data — belt AND
-- suspenders, exactly like the B2 products revoke. The RLS negative suite asserts
-- this and fails CI on any regression.
-- ===========================================================================
revoke all on
  currencies, suppliers, products, product_relations, customers,
  orders, order_items, order_stage_events,
  invoices, invoice_items, payments, expenses,
  profiles, exchange_rates, audit_log,
  analytics_daily, invoice_balances, category_sales
from anon;

-- Future public tables must OPT IN to anon access with an explicit grant, rather
-- than inheriting Supabase's default ALL-to-anon.
alter default privileges in schema public revoke all on tables from anon;
