-- ===========================================================================
-- Fix: analytics_daily counted payment REVERSALS as positive revenue.
--
-- Reversals are stored as POSITIVE amount_pkr rows with kind='reversal' (constraint
-- payments_amount_pos, 090010), so the old `where amount_pkr > 0` was a no-op filter with no sign
-- flip — every reversal ADDED to daily revenue instead of subtracting. A 10,000 payment later
-- reversed reported +20,000 (payment + reversal) instead of net 0. Recompute net, flipping
-- reversals, matching the correct pattern used everywhere else (invoice_balances, useTopCustomer).
-- Only the daily revenue/cash-in series was affected; pnl_summary reads sale_margin, not payments.
-- ===========================================================================
create or replace view analytics_daily as
with rev as (
  select paid_on as day,
         sum(case when kind = 'reversal' then -amount_pkr else amount_pkr end) as revenue_pkr
  from payments group by paid_on
),
exp as (
  select spent_on as day, sum(amount_pkr) as expense_pkr
  from expenses group by spent_on
),
ref as (
  -- 'next' carries the refund to the first day of the following month.
  select case when deduction_cycle = 'next'
              then (date_trunc('month', refunded_on) + interval '1 month')::date
              else refunded_on end as day,
         sum(amount_pkr) as refund_pkr
  from refunds group by 1
),
outflow as (
  select coalesce(exp.day, ref.day)                             as day,
         coalesce(exp.expense_pkr, 0) + coalesce(ref.refund_pkr, 0) as expense_pkr
  from exp full outer join ref on exp.day = ref.day
)
select
  coalesce(rev.day, outflow.day)   as day,
  coalesce(rev.revenue_pkr, 0)     as revenue_pkr,
  coalesce(outflow.expense_pkr, 0) as expense_pkr
from rev
full outer join outflow on rev.day = outflow.day;
