-- ===========================================================================
-- Fix: restore authenticated grants on the vendor-advance ledger.
--
-- vendor_accounts, vendor_advance_entries and the vendor_advance_balances view were missing
-- their SELECT/INSERT grants for `authenticated`, so a logged-in user got "permission denied":
-- the "Record vendor advance" vendor picker came back empty and no balances/ledger showed.
-- (Same class of bug as the investor_owed grant fix, 090065.) The RLS policies already exist
-- and gate who can actually read/write — only the underlying grants were missing. Append-only,
-- so entries need SELECT + INSERT (no UPDATE/DELETE).
-- ===========================================================================

grant select         on vendor_accounts          to authenticated;
grant select, insert on vendor_advance_entries   to authenticated;
grant select         on vendor_advance_balances  to authenticated;

revoke all on vendor_accounts         from anon;
revoke all on vendor_advance_entries  from anon;
revoke all on vendor_advance_balances from anon;
