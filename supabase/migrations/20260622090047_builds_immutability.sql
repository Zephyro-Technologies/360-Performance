-- ===========================================================================
-- Phase 7 hardening (from adversarial review). A DELIVERED one-off build line is the sole
-- realized-P&L record for a one-off part (no batch, no movement) — it must be as immutable as
-- the catalogue ledger. The freeze trigger already blocks UPDATE of a delivered line's money;
-- these close two remaining gaps:
--   1. DELETE: staff/admin could delete a delivered line (or cascade-delete via the build),
--      silently erasing realized house P&L. Block it via RLS (service_role still bypasses for
--      test cleanup, matching the payments immutable-ledger pattern).
--   2. A delivered line with delivered_on = NULL counted in pnl_summary/build_pnl but excluded
--      from house_margin_daily (which also filters delivered_on) — CHECK makes delivered imply
--      a date, so the three P&L views reconcile.
-- ===========================================================================

-- delivered always carries a date (keeps the three P&L views' delivered predicate consistent)
alter table build_lines add constraint build_lines_delivered_dated
  check (status <> 'delivered' or delivered_on is not null);

-- build_lines: split the blanket write policy so a DELIVERED line can't be DELETED.
drop policy build_lines_write on build_lines;
create policy build_lines_write  on build_lines for insert to authenticated with check (has_role(array['admin','staff']::user_role[]));
create policy build_lines_modify on build_lines for update to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy build_lines_remove on build_lines for delete to authenticated using (has_role(array['admin','staff']::user_role[]) and status <> 'delivered');

-- builds: can't be deleted while any delivered line exists (cascade would wipe realized P&L).
drop policy builds_write on builds;
create policy builds_write  on builds for insert to authenticated with check (has_role(array['admin','staff']::user_role[]));
create policy builds_modify on builds for update to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy builds_remove on builds for delete to authenticated
  using (has_role(array['admin','staff']::user_role[]) and not exists (select 1 from build_lines bl where bl.build_id = builds.id and bl.status = 'delivered'));
