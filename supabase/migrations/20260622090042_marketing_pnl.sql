-- ===========================================================================
-- Phase 8 — wire marketing into "What you kept". marketing = Σ cash marketing + Σ PR-gift
-- landed cost. No double-count: the PR-gift cost lives ONLY here (sale_margin/order_cogs
-- filter kind='sale', so pr_gift never hits COGS/house-margin). The 'marketing' EXPENSE
-- category is superseded by this surface — opex now counts operations/salaries from expenses
-- plus this marketing total.
-- ===========================================================================

create view marketing_spend as
with cash as (select coalesce(sum(amount_pkr), 0) as cash_pkr from cash_marketing),
prg as (
  select coalesce(sum(sm.qty * ba.landed_cost_pkr), 0) as pr_gift_pkr
  from stock_movements sm join batches ba on ba.id = sm.batch_id
  where sm.kind = 'pr_gift'   -- pr_gift movements are un-reversible (guard forbids it — Fix Group 2, 090055); no reversal to net
)
select cash.cash_pkr::numeric(14,2)    as cash_pkr,
       prg.pr_gift_pkr::numeric(14,2)  as pr_gift_pkr,
       (cash.cash_pkr + prg.pr_gift_pkr)::numeric(14,2) as total_pkr
from cash cross join prg;

grant select on marketing_spend to authenticated;
revoke all on marketing_spend from anon;

-- Re-base the P&L totals: opex = operations/salaries (expenses) + marketing (cash + PR gift).
-- "What you kept" = house margin − opex. Drop+recreate (the opex column type changes) and
-- re-grant. No other view references pnl_summary.
drop view if exists pnl_summary;
create view pnl_summary as
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
), ops as (
  select coalesce(sum(amount_pkr), 0) as ops_pkr from expenses where category in ('operations', 'salaries')
), mk as (
  select total_pkr from marketing_spend
)
select sm.revenue_pkr, sm.cogs_pkr, sm.gross_margin_pkr, sm.house_margin_pkr, sm.investor_share_pkr,
  mk.total_pkr                              as marketing_pkr,
  (ops.ops_pkr + mk.total_pkr)             as operating_expense_pkr,
  (sm.house_margin_pkr - ops.ops_pkr - mk.total_pkr) as kept_pkr
from sm cross join ops cross join mk;

grant select on pnl_summary to authenticated;
revoke all on pnl_summary from anon;
