-- ===========================================================================
-- Customer delivery costs — the last-mile courier cost to send an order TO a customer.
-- This is genuinely NEW money-out (tracked nowhere before). Inbound/local shipping is
-- untouched — it already lives in each product's landed cost (COGS), so re-logging it
-- here would double-count; the app just relabels that as "Local shipping" in the UI.
--
--   * customer_deliveries: a ledger — amount + bill date + optional order link + a paid_on
--     (null = still owed) + courier/note. A courier bill that arrives weeks late is just
--     added with its real billed_on date (sets up the late-invoice item).
--   * pnl_summary: additive `dl` CTE folded into operating_expense (kept = house_margin −
--     operating_expense stays consistent) + a delivery_pkr line. It reduces "What you kept".
--   * Owed-to-couriers (unpaid) is surfaced on the dashboard "payments owed" area.
-- ===========================================================================

create table customer_deliveries (
  id          uuid primary key default gen_random_uuid(),
  amount_pkr  numeric(12,2) not null check (amount_pkr > 0),
  billed_on   date not null default current_date,       -- bill/delivery date (backdate late bills)
  paid_on     date,                                       -- null = still owed to the courier
  order_id    uuid references orders(id) on delete set null,
  courier     text,
  note        text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index customer_deliveries_billed_idx on customer_deliveries(billed_on);
create index customer_deliveries_order_idx on customer_deliveries(order_id);

-- ---- fold delivery cost into "What you kept" (lifetime; a pure additive opex) --------------
drop view if exists pnl_summary;
create view pnl_summary as
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
), bo as (
  select coalesce(sum(qty * sale_price_pkr), 0) as revenue_pkr,
         coalesce(sum(qty * landed_cost_pkr), 0) as cogs_pkr
  from build_lines where status = 'delivered'
), ops as (
  select coalesce(sum(amount_pkr), 0) as ops_pkr
  from expenses where category in ('operations', 'salaries', 'rent', 'subscriptions', 'other')
), mk as (
  select total_pkr from marketing_spend
), cl as (
  select total_pkr from corrections_loss
), rf as (
  select coalesce(sum(amount_pkr), 0) as total_pkr from refunds
), dl as (
  select coalesce(sum(amount_pkr), 0) as total_pkr from customer_deliveries
)
select
  (sm.revenue_pkr + bo.revenue_pkr)                          as revenue_pkr,
  (sm.cogs_pkr + bo.cogs_pkr)                                as cogs_pkr,
  (sm.gross_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as gross_margin_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as house_margin_pkr,
  sm.investor_share_pkr,
  mk.total_pkr                                               as marketing_pkr,
  cl.total_pkr                                               as corrections_pkr,
  rf.total_pkr                                               as refunds_pkr,
  dl.total_pkr                                               as delivery_pkr,
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr + rf.total_pkr + dl.total_pkr)               as operating_expense_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr) - ops.ops_pkr - mk.total_pkr - cl.total_pkr - rf.total_pkr - dl.total_pkr) as kept_pkr
from sm cross join bo cross join ops cross join mk cross join cl cross join rf cross join dl;

grant select on pnl_summary to authenticated;
revoke all on pnl_summary from anon;

-- ---- RLS + grants + anon-hardening (mirrors refunds) --------------------------------------
alter table customer_deliveries enable row level security;

grant select, insert, update, delete on customer_deliveries to authenticated;

create policy delivery_read  on customer_deliveries for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy delivery_write on customer_deliveries for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

revoke all on customer_deliveries from anon;
