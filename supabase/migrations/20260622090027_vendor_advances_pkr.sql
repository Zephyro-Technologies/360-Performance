-- ===========================================================================
-- 360 Performance — vendor advances go PKR-NATIVE (Phase 1 correction).
-- The 3 logistics vendors (payment / air-freight / sea-freight) are ALL paid in PKR,
-- so the ledger tracks the parked balance DIRECTLY in PKR. Drop the RMB source-of-truth
-- (amount_foreign) + the per-account currency + the live-PKR conversion. The immutable-
-- ledger guarantees are UNCHANGED (positive amounts, reversal rows, the balance guard,
-- append-only RLS, anon-revoked) — the arithmetic is now exact in PKR (no rate drift).
-- Sea-freight's PKR is derived from a vendor RMB rate, but only the final PKR is recorded
-- here; the RMB rate is a product-costing concern (Phase 2), not an advances one.
-- ===========================================================================

-- The balance view reads amount_foreign + currency; drop it before altering them.
drop view vendor_advance_balances;

-- RMB amount -> PKR amount (the check constraint expression follows the rename).
alter table vendor_advance_entries rename column amount_foreign to amount_pkr;

-- Per-account currency is meaningless now (all PKR).
alter table vendor_accounts drop column currency;

-- Guard rebuilt on amount_pkr — identical integrity rules (opposite-kind / equal-amount /
-- not-already-reversed reversals; balance can never go negative).
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
    select kind, amount_pkr, vendor_account_id, reverses_id
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
    if new.amount_pkr <> v_ref_amt then
      raise exception 'A reversal must match the amount of the entry it corrects.' using errcode = 'check_violation';
    end if;
    if v_ref_rev is not null then
      raise exception 'You cannot reverse a reversal row.' using errcode = 'check_violation';
    end if;
  end if;

  select coalesce(sum(case when kind = 'topup' then amount_pkr else -amount_pkr end), 0)
    into v_balance from vendor_advance_entries where vendor_account_id = new.vendor_account_id;
  v_balance := v_balance + (case when new.kind = 'topup' then new.amount_pkr else -new.amount_pkr end);
  if v_balance < 0 then
    raise exception 'Draw-down exceeds the available advance balance.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Balance per account in PKR (the parked figure, directly — no conversion).
create view vendor_advance_balances as
select va.id as vendor_account_id, va.name, va.role, va.active,
  coalesce(sum(case when e.kind = 'topup' then e.amount_pkr else -e.amount_pkr end), 0) as balance_pkr
from vendor_accounts va
left join vendor_advance_entries e on e.vendor_account_id = va.id
group by va.id, va.name, va.role, va.active;

revoke all on vendor_advance_balances from anon;
