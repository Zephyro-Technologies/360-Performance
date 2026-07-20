-- Fix: adding/editing air-sea (logistics) vendors now happens in the app (Data Management →
-- Vendors), but `authenticated` only had SELECT on vendor_accounts (090066) — writes were only
-- ever done by in-migration seeds — so an admin creating a vendor got "permission denied".
-- The vendor_accounts_write RLS policy (090023) already restricts writes to admins; this just
-- adds the underlying table grant the policy needs to take effect. anon stays fully revoked.
grant insert, update, delete on vendor_accounts to authenticated;

revoke all on vendor_accounts from anon;
