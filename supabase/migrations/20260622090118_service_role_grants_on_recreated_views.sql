-- ===========================================================================
-- Restore service_role SELECT on the reporting views that lost it.
--
-- 090107 (remove Custom Builds) dropped and recreated pnl_summary, house_margin_daily and
-- activity_days, but re-granted them only to `authenticated`. A recreated view does not inherit
-- the old object's grants, so service_role silently lost read access — while sibling views left
-- untouched (sale_margin, marketing_spend, corrections_loss) still have it.
--
-- Symptom: anything running as service_role — Edge Functions, scheduled jobs, the RLS suite's
-- own fixtures — reads pnl_summary as EMPTY rather than erroring, because PostgREST returns no
-- rows. Silent wrong answers, not a loud failure. The admin dashboard was unaffected: it reads
-- as `authenticated`.
--
-- category_sales and order_invoice_mismatch (090112 / 090113) are granted here too, for the same
-- reason and to keep the reporting surface consistent.
--
-- service_role is server-side only (never in a client bundle — CI greps for it), so this widens
-- nothing that is reachable from the browser. anon remains revoked throughout.
-- ===========================================================================

grant select on pnl_summary            to service_role;
grant select on house_margin_daily     to service_role;
grant select on activity_days          to service_role;
grant select on category_sales         to service_role;
grant select on order_invoice_mismatch to service_role;

-- Belt and braces: anon must still be denied on every one of them.
revoke all on pnl_summary            from anon;
revoke all on house_margin_daily     from anon;
revoke all on activity_days          from anon;
revoke all on category_sales         from anon;
revoke all on order_invoice_mismatch from anon;
