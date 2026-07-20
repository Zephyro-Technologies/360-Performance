-- ===========================================================================
-- Supplier payments + credit. You can pay a product supplier MORE than currently due; the
-- excess becomes CREDIT that carries forward and is consumed automatically as you order more
-- (owed rises → net credit falls). Mirrors the app's other immutable ledgers (payments,
-- vendor advances): append-only, corrections are reversal rows, never edits/deletes.
--
--   * supplier_payments : the ledger (kind 'payment' | 'reversal').
--   * supplier_balances : per supplier — owed (total cost of committed POs) vs paid (net of
--                         reversals) → credit (overpaid) / payable (still owed).
-- B2-sensitive (amounts + owed derive from cost): authenticated only, anon revoked.
-- ===========================================================================
create table supplier_payments (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references suppliers(id) on delete restrict,
  amount_pkr   numeric(14,2) not null check (amount_pkr > 0),
  kind         payment_kind not null default 'payment',
  reverses_id  uuid references supplier_payments(id),
  method       payment_method not null default 'bank_transfer',
  paid_on      date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);
create index supplier_payments_supplier_idx on supplier_payments(supplier_id);
create unique index supplier_payments_reverses_uniq on supplier_payments(reverses_id) where reverses_id is not null;

-- Reversal integrity (mirror of the payments guard): a reversal must point at a real, same-supplier,
-- not-already-reversed 'payment' of equal amount; a non-reversal may not reference anything.
create or replace function guard_supplier_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare r supplier_payments;
begin
  if new.kind = 'reversal' then
    if new.reverses_id is null then raise exception 'A reversal must reference the payment it corrects.' using errcode = 'check_violation'; end if;
    select * into r from supplier_payments where id = new.reverses_id;
    if r.id is null then raise exception 'The payment being reversed was not found.' using errcode = 'check_violation'; end if;
    if r.kind <> 'payment' then raise exception 'You can only reverse a payment.' using errcode = 'check_violation'; end if;
    if r.supplier_id <> new.supplier_id then raise exception 'A reversal must be on the same supplier.' using errcode = 'check_violation'; end if;
    if new.amount_pkr <> r.amount_pkr then raise exception 'A reversal must match the payment amount.' using errcode = 'check_violation'; end if;
  elsif new.reverses_id is not null then
    raise exception 'Only a reversal may reference another payment.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger guard_supplier_payment before insert on supplier_payments for each row execute function guard_supplier_payment();

-- ---- RLS: read staff/admin/viewer; staff record payments, admin records reversals; immutable ----
alter table supplier_payments enable row level security;
grant select, insert on supplier_payments to authenticated;
revoke all on supplier_payments from anon;
create policy supplier_payments_read on supplier_payments for select to authenticated
  using (has_role(array['admin','staff','viewer']::user_role[]));
create policy supplier_payments_insert on supplier_payments for insert to authenticated
  with check (case when kind = 'reversal' then has_role(array['admin']::user_role[]) else has_role(array['admin','staff']::user_role[]) end);
create trigger audit_supplier_payments after insert or update or delete on supplier_payments for each row execute function log_audit();

-- ---- per-supplier balance --------------------------------------------------------------------
create view supplier_balances as
with owed as (
  select po.supplier_id,
    coalesce(sum(round(l.qty_ordered * l.unit_cost_pkr + l.qty_ordered * l.shipping_per_unit_pkr, 2)), 0) as owed_pkr
  from purchase_orders po
  join purchase_order_lines_costed l on l.purchase_order_id = po.id
  where po.status <> all (array['planning','approved','cancelled']::po_status[])
  group by po.supplier_id
),
paid as (
  select supplier_id, coalesce(sum(case when kind = 'reversal' then -amount_pkr else amount_pkr end), 0) as paid_pkr
  from supplier_payments group by supplier_id
)
select
  s.id                                                              as supplier_id,
  s.name,
  coalesce(o.owed_pkr, 0)::numeric(14,2)                            as owed_pkr,
  coalesce(p.paid_pkr, 0)::numeric(14,2)                            as paid_pkr,
  greatest(coalesce(p.paid_pkr, 0) - coalesce(o.owed_pkr, 0), 0)::numeric(14,2) as credit_pkr,
  greatest(coalesce(o.owed_pkr, 0) - coalesce(p.paid_pkr, 0), 0)::numeric(14,2) as payable_pkr
from suppliers s
left join owed o on o.supplier_id = s.id
left join paid p on p.supplier_id = s.id;

grant select on supplier_balances to authenticated;
revoke all on supplier_balances from anon;
