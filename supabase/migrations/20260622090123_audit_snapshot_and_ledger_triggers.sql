-- ===========================================================================
-- P1 (integrity) — forensic audit hardening.
--
-- Two gaps the schema audit surfaced:
--   * log_audit stored only entity_id + a thin `detail` string, so a DELETE told you a row
--     vanished but not WHAT it held — useless for a financial ledger. Add a full-row `snapshot`
--     (the pre-change row on UPDATE/DELETE, the new row on INSERT) so nothing is unrecoverable.
--   * refunds / customer_deliveries / cash_marketing (money-out ledgers folded into lifetime
--     P&L) and profiles (role grants) + settings (tax/bank) carried NO audit trigger. Add them.
-- Pure trigger/observability change — no business logic, no view or RPC body touched.
-- ===========================================================================

alter table audit_log add column snapshot jsonb;

create or replace function log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  aname text;
  rec   jsonb;
begin
  if actor is null then
    return null; -- seed / service-role / system writes are not user-audited
  end if;
  select name into aname from profiles where id = actor;
  rec := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  insert into audit_log (actor_id, actor_name, action, entity_type, entity_id, detail, snapshot)
  values (
    actor,
    aname,
    tg_op,
    tg_table_name,
    rec->>'id',
    coalesce(
      rec->>'name', rec->>'order_no', rec->>'invoice_no', rec->>'sku', rec->>'email',
      rec->>'correction_no', rec->>'po_no', rec->>'quote_no',
      case when rec ? 'amount_pkr' then 'PKR ' || (rec->>'amount_pkr') end
    ),
    -- Preserve what is otherwise unrecoverable: the row a DELETE erased / an UPDATE overwrote.
    case when tg_op = 'INSERT' then to_jsonb(new) else to_jsonb(old) end
  );
  return null;
end $$;

create trigger audit_refunds             after insert or update or delete on refunds             for each row execute function log_audit();
create trigger audit_customer_deliveries after insert or update or delete on customer_deliveries for each row execute function log_audit();
create trigger audit_cash_marketing      after insert or update or delete on cash_marketing      for each row execute function log_audit();
create trigger audit_profiles            after insert or update or delete on profiles            for each row execute function log_audit();
create trigger audit_settings            after insert or update or delete on settings            for each row execute function log_audit();
