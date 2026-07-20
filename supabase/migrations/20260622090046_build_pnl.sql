-- ===========================================================================
-- Phase 7 — fold builds into the house P&L, exactly once. A build's CATALOGUE side already
-- flows through sale_margin (its order_items are ordinary kind='sale' sales). Only the ONE-OFF
-- side needs adding: delivered build_lines contribute revenue + cost (100% house — one-offs have
-- no investor). The two sources are physically disjoint tables, so no double-count; cash still
-- flows once via payments->analytics_daily, billed once via the invoice.
--   * pnl_summary: additive `bo` CTE (drop+recreate, per the marketing_pnl.sql precedent).
--   * house_margin_daily: union delivered one-offs by delivered_on so the daily series matches.
--   * build_pnl: the per-car project P&L (realized/banked).
-- ===========================================================================

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
)
select
  (sm.revenue_pkr + bo.revenue_pkr)                          as revenue_pkr,
  (sm.cogs_pkr + bo.cogs_pkr)                                as cogs_pkr,
  (sm.gross_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as gross_margin_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as house_margin_pkr,
  sm.investor_share_pkr,
  mk.total_pkr                                               as marketing_pkr,
  (ops.ops_pkr + mk.total_pkr)                               as operating_expense_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr) - ops.ops_pkr - mk.total_pkr) as kept_pkr
from sm cross join bo cross join ops cross join mk;

grant select on pnl_summary to authenticated;
revoke all on pnl_summary from anon;

-- Daily house margin now also counts delivered one-off build lines (by delivered_on).
drop view if exists house_margin_daily;
create view house_margin_daily as
select day,
  sum(revenue_pkr)::numeric(14,2)      as revenue_pkr,
  sum(gross_margin_pkr)::numeric(14,2) as gross_margin_pkr,
  sum(house_margin_pkr)::numeric(14,2) as house_margin_pkr
from (
  select occurred_on as day, revenue_pkr, margin_pkr as gross_margin_pkr, house_share_pkr as house_margin_pkr
  from sale_margin
  union all
  select delivered_on as day,
    (qty * sale_price_pkr)                        as revenue_pkr,
    (qty * (sale_price_pkr - landed_cost_pkr))    as gross_margin_pkr,
    (qty * (sale_price_pkr - landed_cost_pkr))    as house_margin_pkr
  from build_lines where status = 'delivered' and delivered_on is not null
) t
group by day;

grant select on house_margin_daily to authenticated;
revoke all on house_margin_daily from anon;

-- Per-build project P&L (realized/banked): catalogue side via sale_margin over the backing
-- order (delivered lines have movements); one-off side = delivered build_lines.
create view build_pnl as
with cat as (
  select b.id as build_id,
    coalesce(sum(sm.revenue_pkr), 0)::numeric(14,2)        as catalogue_revenue_pkr,
    coalesce(sum(sm.cogs_pkr), 0)::numeric(14,2)           as catalogue_cogs_pkr,
    coalesce(sum(sm.house_share_pkr), 0)::numeric(14,2)    as catalogue_house_margin_pkr,
    coalesce(sum(sm.investor_share_pkr), 0)::numeric(14,2) as investor_share_pkr
  from builds b
  left join sale_margin sm on sm.order_id = b.order_id
  group by b.id
), oo as (
  select build_id,
    coalesce(sum(qty * sale_price_pkr) filter (where status = 'delivered'), 0)::numeric(14,2) as oneoff_revenue_pkr,
    coalesce(sum(qty * landed_cost_pkr) filter (where status = 'delivered'), 0)::numeric(14,2) as oneoff_cogs_pkr
  from build_lines group by build_id
)
select b.id as build_id, b.build_no, b.name, b.customer_id, b.status, b.order_id,
  cat.catalogue_revenue_pkr, cat.catalogue_cogs_pkr, cat.catalogue_house_margin_pkr, cat.investor_share_pkr,
  coalesce(oo.oneoff_revenue_pkr, 0)::numeric(14,2) as oneoff_revenue_pkr,
  coalesce(oo.oneoff_cogs_pkr, 0)::numeric(14,2)    as oneoff_cogs_pkr,
  (cat.catalogue_revenue_pkr + coalesce(oo.oneoff_revenue_pkr, 0))::numeric(14,2) as revenue_pkr,
  (cat.catalogue_cogs_pkr + coalesce(oo.oneoff_cogs_pkr, 0))::numeric(14,2)       as cogs_pkr,
  (cat.catalogue_house_margin_pkr + (coalesce(oo.oneoff_revenue_pkr, 0) - coalesce(oo.oneoff_cogs_pkr, 0)))::numeric(14,2) as house_profit_pkr
from builds b
join cat on cat.build_id = b.id
left join oo on oo.build_id = b.id;

grant select on build_pnl to authenticated;
revoke all on build_pnl from anon;
