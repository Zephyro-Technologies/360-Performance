-- ===========================================================================
-- Phase 10 (Part A) — the expenses ledger is now OPEX-ONLY and drives "What you kept".
--   (1) pnl_summary's ops CTE counts the FULL opex set (operations/salaries/rent/subscriptions/
--       other). NEVER inventory/shipping (those are COGS, already netted inside sale_margin) or
--       marketing (already the mk CTE = marketing_spend) — adding them here would double-count.
--   (2) a CHECK blocks logging inventory/shipping as an expense at all: pnl_summary already
--       ignores them, but analytics_daily.expense_pkr sums ALL categories, so an inventory row
--       would wrongly lower cash "Money out"/"kept". NOT VALID tolerates any legacy rows while
--       blocking new non-opex writes.
-- create-or-replace preserves grants; only the ops CTE's category filter changes (columns are
-- identical), so this is a pure additive widen.
-- ===========================================================================
create or replace view pnl_summary as
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
)
select
  (sm.revenue_pkr + bo.revenue_pkr)                          as revenue_pkr,
  (sm.cogs_pkr + bo.cogs_pkr)                                as cogs_pkr,
  (sm.gross_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as gross_margin_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as house_margin_pkr,
  sm.investor_share_pkr,
  mk.total_pkr                                               as marketing_pkr,
  cl.total_pkr                                               as corrections_pkr,
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr)               as operating_expense_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr) - ops.ops_pkr - mk.total_pkr - cl.total_pkr) as kept_pkr
from sm cross join bo cross join ops cross join mk cross join cl;

grant select on pnl_summary to authenticated;
revoke all on pnl_summary from anon;

-- Inventory + shipping are COGS (batch/PO system), never an operating expense — block them here.
alter table expenses add constraint expenses_opex_only
  check (category in ('operations', 'salaries', 'rent', 'subscriptions', 'other')) not valid;
