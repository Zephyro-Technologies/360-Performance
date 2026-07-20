-- ===========================================================================
-- Remove the Custom Builds feature entirely (app + DB). Drops every build object and rebuilds the
-- four shared P&L surfaces WITHOUT the build one-off contribution (sales-only). A later migration
-- re-folds the new ORDER one-off products into these same surfaces.
--
-- Product-less support in create_invoice/update_invoice (090097) and create_quotation/update_quotation
-- (090098) is a GENERAL capability now and is intentionally kept. Ex-backing orders survive as
-- ordinary orders (builds.order_id was on delete set null).
-- ===========================================================================

-- ---- 1. Drop the P&L surfaces that reference build tables (recreated sales-only below) ------------
drop view     if exists build_pnl;
drop view     if exists activity_days;
drop function if exists pnl_summary_between(date, date);
drop view     if exists house_margin_daily;
drop view     if exists pnl_summary;

-- ---- 2. Drop build RPCs (before the enums they take as params) -----------------------------------
drop function if exists set_build_part_stage(uuid, boolean, build_stage);
drop function if exists ship_build_line(uuid, int, date);
drop function if exists set_build_line_status(uuid, build_line_status);
drop function if exists create_build(uuid, jsonb, text, text, jsonb, jsonb, text);
drop function if exists add_build_catalogue_line(uuid, uuid, int, numeric);
drop function if exists assign_build_no() cascade;            -- cascade drops the builds_assign_no trigger
drop function if exists freeze_shipped_build_line() cascade;  -- cascade drops the build_lines_freeze trigger

-- ---- 3. Drop build tables (FK order: shipments → lines → builds) ----------------------------------
drop table if exists build_line_shipments cascade;
drop table if exists build_lines cascade;
drop table if exists builds cascade;

-- ---- 4. Drop the build-only column, sequence, enums ----------------------------------------------
alter table order_items drop column if exists build_stage;
drop sequence if exists build_no_seq;
drop type if exists build_stage;
drop type if exists build_line_status;
drop type if exists build_status;

-- ---- 5. Recreate the four shared surfaces, SALES-ONLY (build contribution removed) ---------------
create view pnl_summary as
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
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
  sm.revenue_pkr, sm.cogs_pkr, sm.gross_margin_pkr, sm.house_margin_pkr, sm.investor_share_pkr,
  mk.total_pkr as marketing_pkr,
  cl.total_pkr as corrections_pkr,
  rf.total_pkr as refunds_pkr,
  dl.total_pkr as delivery_pkr,
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr + rf.total_pkr + dl.total_pkr) as operating_expense_pkr,
  (sm.house_margin_pkr - ops.ops_pkr - mk.total_pkr - cl.total_pkr - rf.total_pkr - dl.total_pkr) as kept_pkr
from sm cross join ops cross join mk cross join cl cross join rf cross join dl;
grant select on pnl_summary to authenticated;
revoke all on pnl_summary from anon;

create view house_margin_daily as
select day,
  sum(revenue_pkr)::numeric(14,2)      as revenue_pkr,
  sum(gross_margin_pkr)::numeric(14,2) as gross_margin_pkr,
  sum(house_margin_pkr)::numeric(14,2) as house_margin_pkr
from (
  select occurred_on as day, revenue_pkr, margin_pkr as gross_margin_pkr, house_share_pkr as house_margin_pkr
  from sale_margin
) t
group by day;
grant select on house_margin_daily to authenticated;
revoke all on house_margin_daily from anon;

create or replace function pnl_summary_between(p_start date, p_end date)
returns table (
  revenue_pkr numeric, cogs_pkr numeric, gross_margin_pkr numeric, house_margin_pkr numeric,
  investor_share_pkr numeric, marketing_pkr numeric, corrections_pkr numeric, refunds_pkr numeric,
  delivery_pkr numeric, operating_expense_pkr numeric, kept_pkr numeric
)
language sql stable security invoker set search_path = public as $$
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
  where occurred_on between p_start and p_end
), ops as (
  select coalesce(sum(amount_pkr), 0) as ops_pkr
  from expenses
  where category in ('operations', 'salaries', 'rent', 'subscriptions', 'other')
    and spent_on between p_start and p_end
), mk as (
  select
    coalesce((select sum(amount_pkr) from cash_marketing where spent_on between p_start and p_end), 0)
    + coalesce((select sum(cogs_pkr_snap) from stock_movements where kind = 'pr_gift' and occurred_on between p_start and p_end), 0) as total_pkr
), cl as (
  select
    coalesce((select sum(amount_pkr) from corrections
              where action = any (array['refund'::correction_action, 'compensation'::correction_action])
                and created_at::date between p_start and p_end), 0)
    + coalesce((select sum(cogs_pkr_snap) from stock_movements where kind = 'replacement' and occurred_on between p_start and p_end), 0) as total_pkr
), rf as (
  select coalesce(sum(amount_pkr), 0) as total_pkr from refunds where refunded_on between p_start and p_end
), dl as (
  select coalesce(sum(amount_pkr), 0) as total_pkr from customer_deliveries where billed_on between p_start and p_end
)
select
  sm.revenue_pkr, sm.cogs_pkr, sm.gross_margin_pkr, sm.house_margin_pkr, sm.investor_share_pkr,
  mk.total_pkr, cl.total_pkr, rf.total_pkr, dl.total_pkr,
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr + rf.total_pkr + dl.total_pkr),
  (sm.house_margin_pkr - ops.ops_pkr - mk.total_pkr - cl.total_pkr - rf.total_pkr - dl.total_pkr)
from sm cross join ops cross join mk cross join cl cross join rf cross join dl;
$$;
revoke all on function pnl_summary_between(date, date) from public;
grant execute on function pnl_summary_between(date, date) to authenticated;

create view activity_days as
  select occurred_on as day from sale_margin where occurred_on is not null
  union select spent_on from expenses
  union select spent_on from cash_marketing
  union select occurred_on from stock_movements where kind in ('pr_gift', 'replacement')
  union select created_at::date from corrections where action in ('refund', 'compensation')
  union select refunded_on from refunds
  union select billed_on from customer_deliveries
  union select paid_on from payments
  union select issue_date from invoices where voided_at is null;
grant select on activity_days to authenticated;
revoke all   on activity_days from anon;
