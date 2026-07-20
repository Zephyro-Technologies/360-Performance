-- ===========================================================================
-- Refunds tracker — a standalone log of out-of-pocket money sent back (e.g. damaged
-- goods on arrival, goodwill, cash returned). This is DISTINCT from the per-order
-- "refund = reverse a payment" correction (Phase 9): that reverses a recorded payment
-- and nets it off revenue via analytics_daily; THIS ledger is fresh cash going OUT and
-- lands on the expense/outflow side. The two never touch the same money, so folding
-- both into "What you kept" cannot double-count a single refund.
--
--   * refunds: amount + date + a MANDATORY audit note (why the money went back) + an
--     optional order link + a deduction_cycle toggle.
--   * deduction_cycle: 'current' hits the month it was refunded; 'next' carries it to
--     the following month so a period whose profit was already split isn't clawed back.
--     The cycle only shifts WHICH day/period it lands on in analytics_daily; lifetime
--     "What you kept" subtracts every refund regardless.
--   * analytics_daily.expense_pkr: refunds join the daily outflow by their EFFECTIVE day
--     (refunded_on, or the 1st of next month when carried forward).
--   * pnl_summary: additive `rf` CTE folded into operating_expense (so kept = house_margin
--     − operating_expense stays consistent) + a refunds_pkr line.
-- ===========================================================================

create type refund_cycle as enum ('current', 'next');

create table refunds (
  id              uuid primary key default gen_random_uuid(),
  amount_pkr      numeric(12,2) not null check (amount_pkr > 0),
  refunded_on     date not null default current_date,
  deduction_cycle refund_cycle not null default 'current',
  reason          text not null check (length(btrim(reason)) > 0),  -- mandatory audit note
  order_id        uuid references orders(id) on delete set null,     -- optional link (spot overlaps)
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now()
);
create index refunds_refunded_on_idx on refunds(refunded_on);
create index refunds_order_idx on refunds(order_id);

-- ---- fold refunds into the daily cash outflow, honouring the deduction cycle ---------------
create or replace view analytics_daily as
with rev as (
  select paid_on as day, sum(amount_pkr) as revenue_pkr
  from payments where amount_pkr > 0 group by paid_on
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

-- ---- fold refunds into "What you kept" (lifetime; a pure additive house loss) --------------
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
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr + rf.total_pkr) as operating_expense_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr) - ops.ops_pkr - mk.total_pkr - cl.total_pkr - rf.total_pkr) as kept_pkr
from sm cross join bo cross join ops cross join mk cross join cl cross join rf;

grant select on pnl_summary to authenticated;
revoke all on pnl_summary from anon;

-- ---- RLS + grants + anon-hardening (mirrors cash_marketing) --------------------------------
alter table refunds enable row level security;

grant select, insert, update, delete on refunds to authenticated;

create policy refunds_read  on refunds for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy refunds_write on refunds for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

revoke all on refunds from anon;
