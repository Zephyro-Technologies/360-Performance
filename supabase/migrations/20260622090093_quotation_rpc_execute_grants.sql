-- Hardening: the quotation RPCs (090087) were left PUBLIC-executable (default function ACL),
-- unlike every other write RPC (create_invoice/create_order/update_invoice all revoke PUBLIC and
-- grant only authenticated). They're security-invoker so anon can't actually write (RLS blocks the
-- first insert), but this closes the gap and matches the house pattern.
revoke all on function create_quotation(uuid, jsonb, uuid, jsonb, text) from public;
revoke all on function update_quotation(uuid, jsonb, text)             from public;
grant execute on function create_quotation(uuid, jsonb, uuid, jsonb, text) to authenticated;
grant execute on function update_quotation(uuid, jsonb, text)             to authenticated;
