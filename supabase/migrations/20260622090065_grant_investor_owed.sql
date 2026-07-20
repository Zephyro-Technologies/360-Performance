-- ===========================================================================
-- Fix: restore SELECT grants on investor_sale_accrual + investor_owed.
--
-- Migration 090056 (snapshot_sale_economics) DROPPED and re-CREATED these two views to read
-- the per-movement snapshot. Dropping a view drops its grants, and the recreate never re-added
-- them — so `authenticated` (any logged-in user) got "permission denied for view investor_owed"
-- on the investor settlement panel. The app swallowed the error into an empty "nothing accrued"
-- state (0 owed, payout disabled), even though the data was correct. Restore the grants.
-- ===========================================================================

grant select on investor_sale_accrual to authenticated;
grant select on investor_owed        to authenticated;

revoke all on investor_sale_accrual from anon;
revoke all on investor_owed        from anon;
