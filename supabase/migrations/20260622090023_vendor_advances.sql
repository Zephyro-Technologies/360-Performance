-- ===========================================================================
-- 360 Performance — vendor advance-payment tracking (working-capital ledger).
-- The client parks prepaid credit with 3 Chinese vendors (payment / air freight /
-- sea freight). SIMPLE TRACKER (Model A): balance + history ONLY, entirely OUTSIDE
-- the P&L — referenced by ZERO analytics views; a top-up is a cash TRANSFER
-- (bank -> vendor credit), never an `expenses` row, so the same rupees are never
-- counted as both profit and cost. The RMB amount is the SOURCE OF TRUTH (balance
-- summed in RMB); PKR is converted LIVE for display from exchange_rates (the CNY
-- rate), never frozen. Mirrors the payments immutable-ledger discipline: positive-only
-- amounts, corrections as reversal rows, append-only RLS, a balance guard.
-- ===========================================================================

create type vendor_role  as enum ('payment', 'air_freight', 'sea_freight');
create type advance_kind as enum ('topup', 'drawdown');

-- The 3 working-capital money accounts. Distinct from product suppliers (FY MOTO):
-- these hold prepaid credit and have no products. supplier_id is optional future-
-- proofing — left NULL (none of the 3 is a product supplier).
create table vendor_accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role        vendor_role not null,
  currency    char(3) not null default 'CNY' references currencies(code),
  supplier_id uuid references suppliers(id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger vendor_accounts_set_updated_at before update on vendor_accounts
  for each row execute function set_updated_at();

-- Immutable advance ledger. amount_foreign is in the account's currency (RMB) — the
-- source of truth. A correction is a reversal row: the OPPOSITE kind, equal amount,
-- referencing the entry it corrects (kept, never edited/deleted).
create table vendor_advance_entries (
  id                uuid primary key default gen_random_uuid(),
  vendor_account_id uuid not null references vendor_accounts(id) on delete restrict,
  kind              advance_kind not null,
  amount_foreign    numeric(14,2) not null check (amount_foreign > 0),
  occurred_on       date not null default current_date,
  order_id          uuid references orders(id) on delete set null,   -- optional tag (future traceability)
  reverses_id       uuid references vendor_advance_entries(id),       -- correction = reversal row
  note              text,
  created_at        timestamptz not null default now()
);
create index vendor_advance_entries_account_idx on vendor_advance_entries(vendor_account_id);
-- an entry can be reversed at most once
create unique index vendor_advance_entries_reverses_uniq
  on vendor_advance_entries(reverses_id) where reverses_id is not null;

-- Guard: balance never goes negative; reversal integrity (opposite kind, same account,
-- equal amount, target is not itself a reversal). Mirrors guard_payment_overpay.
create or replace function guard_vendor_advance() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_balance  numeric;
  v_ref_kind advance_kind;
  v_ref_amt  numeric;
  v_ref_acct uuid;
  v_ref_rev  uuid;
begin
  if new.reverses_id is not null then
    select kind, amount_foreign, vendor_account_id, reverses_id
      into v_ref_kind, v_ref_amt, v_ref_acct, v_ref_rev
      from vendor_advance_entries where id = new.reverses_id;
    if v_ref_kind is null then
      raise exception 'The entry being reversed was not found.' using errcode = 'check_violation';
    end if;
    if v_ref_acct <> new.vendor_account_id then
      raise exception 'A reversal must be on the same vendor account.' using errcode = 'check_violation';
    end if;
    if new.kind = v_ref_kind then
      raise exception 'A reversal must be the opposite kind of the entry it corrects.' using errcode = 'check_violation';
    end if;
    if new.amount_foreign <> v_ref_amt then
      raise exception 'A reversal must match the amount of the entry it corrects.' using errcode = 'check_violation';
    end if;
    if v_ref_rev is not null then
      raise exception 'You cannot reverse a reversal row.' using errcode = 'check_violation';
    end if;
  end if;

  select coalesce(sum(case when kind = 'topup' then amount_foreign else -amount_foreign end), 0)
    into v_balance from vendor_advance_entries where vendor_account_id = new.vendor_account_id;
  v_balance := v_balance + (case when new.kind = 'topup' then new.amount_foreign else -new.amount_foreign end);
  if v_balance < 0 then
    raise exception 'Draw-down exceeds the available advance balance.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger vendor_advance_guard before insert on vendor_advance_entries
  for each row execute function guard_vendor_advance();

-- Balance per account in RMB (source of truth). PKR is computed LIVE client-side from
-- exchange_rates — deliberately NOT here — so the parked figure revalues with the rate.
create view vendor_advance_balances as
select va.id as vendor_account_id, va.name, va.role, va.currency, va.active,
  coalesce(sum(case when e.kind = 'topup' then e.amount_foreign else -e.amount_foreign end), 0) as balance_foreign
from vendor_accounts va
left join vendor_advance_entries e on e.vendor_account_id = va.id
group by va.id, va.name, va.role, va.currency, va.active;

-- RLS: internal only. accounts read by staff+, written by admin; entries append-only
-- (staff post topup/drawdown, admin posts reversals); NO update/delete policies.
alter table vendor_accounts        enable row level security;
alter table vendor_advance_entries enable row level security;

create policy vendor_accounts_read  on vendor_accounts        for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy vendor_accounts_write on vendor_accounts        for all    to authenticated using (has_role(array['admin']::user_role[])) with check (has_role(array['admin']::user_role[]));
create policy vendor_entries_read   on vendor_advance_entries for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy vendor_entries_ins    on vendor_advance_entries for insert to authenticated with check (
  (reverses_id is null     and has_role(array['admin','staff']::user_role[]))
  or (reverses_id is not null and has_role(array['admin']::user_role[]))
);

-- anon hardening (default-privilege revoke covers future tables; the VIEW needs explicit).
revoke all on vendor_accounts         from anon;
revoke all on vendor_advance_entries  from anon;
revoke all on vendor_advance_balances from anon;

-- Seed the 3 known working-capital vendors (CNY). Names are editable in the dashboard.
insert into vendor_accounts (name, role, currency) values
  ('Payment Vendor',     'payment',     'CNY'),
  ('Air Freight Vendor', 'air_freight', 'CNY'),
  ('Sea Freight Vendor', 'sea_freight', 'CNY');
