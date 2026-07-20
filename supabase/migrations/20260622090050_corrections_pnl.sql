-- ===========================================================================
-- Phase 9 — fold at-fault corrections into "What you kept" as a house LOSS, exactly once.
-- corrections_loss = Σ(refund + compensation amounts) + Σ(replacement units' landed cost). The
-- two sources are disjoint by CHECK (replacement rows carry amount NULL; refund/comp carry no
-- movement). It's a PURE ADDITIVE loss on top of the untouched original sale margin — a
-- written-off full refund nets kept to −C (house ate the cost of goods, gave the money back).
-- 100% house: it never touches investor_share (an investor at-fault item is house-absorbed).
--   * pnl_summary: additive `cl` CTE folded into operating_expense (so kept = house_margin −
--     operating_expense stays consistent) + a corrections_pkr line.
-- NOTE: replacement movements are non-reversible — guard_stock_movement forbids kind='reversal'
-- on a 'replacement' (Fix Group 2, migration 090055) — so corrections_loss never has a reversal
-- to net. Cash compensation is a P&L loss only — it is NOT on the cash "money out"
-- series (analytics_daily reads expenses); a refund's cash-back DOES fall via the payment reversal.
-- ===========================================================================

create view corrections_loss as
with amt as (
  select coalesce(sum(amount_pkr), 0) as amount_pkr from corrections where action in ('refund', 'compensation')
), repl as (
  select coalesce(sum(sm.qty * ba.landed_cost_pkr), 0) as replacement_pkr
  from stock_movements sm join batches ba on ba.id = sm.batch_id
  where sm.kind = 'replacement'
)
select amt.amount_pkr::numeric(14,2)      as refund_comp_pkr,
       repl.replacement_pkr::numeric(14,2) as replacement_pkr,
       (amt.amount_pkr + repl.replacement_pkr)::numeric(14,2) as total_pkr
from amt cross join repl;

grant select on corrections_loss to authenticated;
revoke all on corrections_loss from anon;

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
  select coalesce(sum(amount_pkr), 0) as ops_pkr from expenses where category in ('operations', 'salaries')
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
