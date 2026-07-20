-- ===========================================================================
-- activity_days — one row per calendar day on which ANY financially-visible
-- event occurred, across every date column the analytics surfaces read.
--
-- WHY A UNION OF ALL OF THEM: the Analytics reporting-period picker marks a
-- period "(0)" and shows a "no activity here" hint based on this view. The set
-- MUST be a SUPERSET of the days any card can draw from, so that a "(0)" is a
-- GUARANTEE of emptiness — no false negatives, we never hide or flag-empty a
-- period that actually has numbers. The converse is NOT guaranteed and is fine:
-- a day carrying only an unpaid invoice appears here but yields zeros from
-- pnl_summary_between. A false "has data" is acceptable; a false "(0)" is not.
-- Do not remove branches from this union without re-reading that paragraph.
--
-- The three notions of "activity date" this reconciles — all three are read by
-- the Analytics page simultaneously, and they disagree with each other:
--   * pnl_summary_between (090086) filters NINE columns, and no payment dates
--   * analytics_daily      (090080) is payments.paid_on — cash, not accrual
--   * category_sales       (090011) is invoices.issue_date
-- If a component is ever added to pnl_summary_between, add its date column here
-- too, or the picker will start flagging a populated period as empty.
-- ===========================================================================

create view activity_days as
  select occurred_on as day from sale_margin where occurred_on is not null
  union select delivered_on from build_lines where status = 'delivered' and delivered_on is not null
  union select spent_on from expenses
  union select spent_on from cash_marketing
  union select occurred_on from stock_movements where kind in ('pr_gift', 'replacement')
  union select created_at::date from corrections where action in ('refund', 'compensation')
  union select refunded_on from refunds
  union select billed_on from customer_deliveries
  union select paid_on from payments
  union select issue_date from invoices where voided_at is null;

comment on view activity_days is
  'Superset of days with any financial activity. Drives the analytics period picker''s empty-period markers; a day missing here is guaranteed to be empty in every card.';

-- Internal financial surface: authenticated only. Views run with the owner's
-- rights, so there is no RLS backstop here — this revoke is the only thing
-- keeping anon out, and packages/rls-tests asserts it.
grant select on activity_days to authenticated;
revoke all   on activity_days from anon;
