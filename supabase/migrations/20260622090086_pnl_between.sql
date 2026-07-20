-- Date-scoped P&L — the exact pnl_summary formula (090060) parameterised by a date window,
-- so the dashboard can show "profit this month" / a month-over-month comparison instead of
-- only the lifetime figure. Each source is filtered by its own effective date:
--   sale_margin.occurred_on · build_lines.delivered_on · expenses.spent_on ·
--   cash_marketing.spent_on + pr_gift movement.occurred_on (marketing) ·
--   corrections.created_at + replacement movement.occurred_on (corrections) ·
--   refunds.refunded_on · customer_deliveries.billed_on
-- The marketing_spend / corrections_loss VIEWS carry no date, so those two pieces are
-- recomputed here from their base tables. Column list & math mirror pnl_summary exactly, so
-- summing every month reconciles to the lifetime view.
create or replace function pnl_summary_between(p_start date, p_end date)
returns table (
  revenue_pkr           numeric,
  cogs_pkr              numeric,
  gross_margin_pkr      numeric,
  house_margin_pkr      numeric,
  investor_share_pkr    numeric,
  marketing_pkr         numeric,
  corrections_pkr       numeric,
  refunds_pkr           numeric,
  delivery_pkr          numeric,
  operating_expense_pkr numeric,
  kept_pkr              numeric
)
language sql stable security invoker set search_path = public as $$
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
  where occurred_on between p_start and p_end
), bo as (
  select coalesce(sum(qty * sale_price_pkr), 0) as revenue_pkr,
         coalesce(sum(qty * landed_cost_pkr), 0) as cogs_pkr
  from build_lines
  where status = 'delivered' and delivered_on between p_start and p_end
), ops as (
  select coalesce(sum(amount_pkr), 0) as ops_pkr
  from expenses
  where category in ('operations', 'salaries', 'rent', 'subscriptions', 'other')
    and spent_on between p_start and p_end
), mk as (
  select
    coalesce((select sum(amount_pkr) from cash_marketing
              where spent_on between p_start and p_end), 0)
    + coalesce((select sum(cogs_pkr_snap) from stock_movements
                where kind = 'pr_gift' and occurred_on between p_start and p_end), 0) as total_pkr
), cl as (
  select
    coalesce((select sum(amount_pkr) from corrections
              where action = any (array['refund'::correction_action, 'compensation'::correction_action])
                and created_at::date between p_start and p_end), 0)
    + coalesce((select sum(cogs_pkr_snap) from stock_movements
                where kind = 'replacement' and occurred_on between p_start and p_end), 0) as total_pkr
), rf as (
  select coalesce(sum(amount_pkr), 0) as total_pkr
  from refunds
  where refunded_on between p_start and p_end
), dl as (
  select coalesce(sum(amount_pkr), 0) as total_pkr
  from customer_deliveries
  where billed_on between p_start and p_end
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
$$;

revoke all on function pnl_summary_between(date, date) from public;
grant execute on function pnl_summary_between(date, date) to authenticated;
