-- ===========================================================================
-- 360 Performance — settings (tax) + server-side audit triggers (Phase 4)
-- NOTE on high-risk deletes (steer #2): authorization uses has_role(), which
-- reads `profiles` DIRECTLY (not the JWT claim) — so admin-only invoice/order
-- DELETE and the payments immutability are evaluated against live roles with no
-- stale-token window. No change needed; documented here for clarity.
-- ===========================================================================

-- Single-row business settings. Tax is settings-driven (never hardcoded).
-- Default rate 0 → inclusive vs exclusive are identical until a real rate is set
-- (treatment is `tax_inclusive`; default exclusive = tax added on top).
create table settings (
  id            boolean primary key default true check (id),
  tax_rate      numeric(5, 4) not null default 0 check (tax_rate >= 0 and tax_rate < 1),
  tax_inclusive boolean not null default false,
  updated_at    timestamptz not null default now()
);
insert into settings (id) values (true);

alter table settings enable row level security;
grant select, update on settings to authenticated;
create policy settings_read on settings for select to authenticated
  using (has_role(array['admin','staff','viewer']::user_role[]));
create policy settings_write on settings for update to authenticated
  using (has_role(array['admin']::user_role[])) with check (has_role(array['admin']::user_role[]));
create trigger settings_set_updated_at before update on settings for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Server-side audit trail. Fires only for authenticated user actions
-- (auth.uid() present) — seed loads and service-role writes are not audited.
-- ---------------------------------------------------------------------------
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
  insert into audit_log (actor_id, actor_name, action, entity_type, entity_id, detail)
  values (
    actor,
    aname,
    tg_op,
    tg_table_name,
    rec->>'id',
    coalesce(rec->>'name', rec->>'order_no', rec->>'invoice_no', rec->>'sku', rec->>'email')
  );
  return null;
end $$;

create trigger audit_products   after insert or update or delete on products   for each row execute function log_audit();
create trigger audit_orders     after insert or update or delete on orders     for each row execute function log_audit();
create trigger audit_invoices   after insert or update or delete on invoices   for each row execute function log_audit();
create trigger audit_payments   after insert or update or delete on payments   for each row execute function log_audit();
create trigger audit_customers  after insert or update or delete on customers  for each row execute function log_audit();
create trigger audit_suppliers  after insert or update or delete on suppliers  for each row execute function log_audit();
create trigger audit_expenses   after insert or update or delete on expenses   for each row execute function log_audit();
create trigger audit_blog       after insert or update or delete on blog_posts for each row execute function log_audit();
