-- ============================================================================
-- Fix Group 3 (C4) — ROW-LOCK the four over-limit guards.
--
-- guard_stock_movement, guard_payment_overpay, guard_investor_payout and guard_vendor_advance are
-- all BEFORE-INSERT triggers that SELECT an aggregate then check a cap — with NO row lock. Under
-- READ COMMITTED two concurrent inserts both read the pre-insert total, both pass the cap, both
-- insert -> oversell / overpay / over-payout / over-advance (the stock oversell was reproduced live:
-- two sessions each drew the last unit of a 1-unit batch -> on_hand = -1).
--
-- Fix: take a SELECT ... FOR UPDATE on the single parent resource row (which always exists — every
-- child FK is NOT NULL, ON DELETE RESTRICT) BEFORE the aggregate, so concurrent callers serialize
-- on that row and the second re-reads the committed total and is correctly rejected. Logic and
-- thresholds are otherwise unchanged.
-- ============================================================================

-- ---- 1. stock: lock the batch row before the per-batch below-zero check. ------------------------
create or replace function guard_stock_movement()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_ref_kind  movement_kind;
  v_ref_qty   int;
  v_ref_batch uuid;
  v_ref_rev   uuid;
  v_delta     int;
  v_remaining int;
  v_owner     owner_kind;
begin
  if new.kind = 'reversal' then
    if new.reverses_id is null then
      raise exception 'A reversal must reference the movement it corrects.' using errcode = 'check_violation';
    end if;
    select kind, qty, batch_id, reverses_id into v_ref_kind, v_ref_qty, v_ref_batch, v_ref_rev
      from stock_movements where id = new.reverses_id;
    if v_ref_kind is null then
      raise exception 'The movement being reversed was not found.' using errcode = 'check_violation';
    end if;
    if v_ref_batch <> new.batch_id then
      raise exception 'A reversal must be on the same batch.' using errcode = 'check_violation';
    end if;
    if new.qty <> v_ref_qty then
      raise exception 'A reversal must match the quantity of the movement it corrects.' using errcode = 'check_violation';
    end if;
    if v_ref_kind = 'reversal' or v_ref_rev is not null then
      raise exception 'You cannot reverse a reversal.' using errcode = 'check_violation';
    end if;
    if v_ref_kind in ('sale', 'pr_gift', 'replacement') then
      raise exception 'A % movement cannot be reversed — unwind it through the at-fault corrections tool, not a raw stock reversal.',
        v_ref_kind using errcode = 'check_violation';
    end if;
  elsif new.reverses_id is not null then
    raise exception 'Only a reversal may reference another movement.' using errcode = 'check_violation';
  end if;

  if new.kind in ('pr_gift', 'replacement') then
    select p.owner_kind into v_owner from batches ba join products p on p.id = ba.product_id where ba.id = new.batch_id;
    if v_owner is distinct from 'house' then
      raise exception '% can only use house stock, not investor stock.',
        case when new.kind = 'pr_gift' then 'PR gifts' else 'At-fault replacements' end using errcode = 'check_violation';
    end if;
  end if;

  -- C4: serialize concurrent movements on this batch so two callers can't both pass the below-zero
  -- check on the same remaining units (TOCTOU oversell). The batch row always exists (FK NOT NULL).
  perform 1 from batches where id = new.batch_id for update;

  v_delta := case
    when new.kind = 'reversal'                then case when v_ref_kind in ('receive','adjust_add') then -new.qty else new.qty end
    when new.kind in ('receive','adjust_add') then new.qty
    else -new.qty end;

  select coalesce(sum(case
    when m.kind = 'reversal'                then case when t.kind in ('receive','adjust_add') then -m.qty else m.qty end
    when m.kind in ('receive','adjust_add') then m.qty
    else -m.qty end), 0)
  into v_remaining
  from stock_movements m left join stock_movements t on t.id = m.reverses_id
  where m.batch_id = new.batch_id;

  if v_remaining + v_delta < 0 then
    raise exception 'This movement would drive batch stock below zero.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---- 2. payments: lock the invoice row (the existing invoice read becomes FOR UPDATE). ----------
create or replace function guard_payment_overpay()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  inv_total    numeric;
  v_voided     timestamptz;
  net_paid     numeric;
  ref_amount   numeric;
  ref_reversed numeric;
begin
  -- C4: FOR UPDATE serializes concurrent payments/reversals on this invoice.
  select total_pkr, voided_at into inv_total, v_voided from invoices where id = new.invoice_id for update;
  if v_voided is not null then
    raise exception 'This invoice is voided; no further payments or reversals.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(case when kind = 'payment' then amount_pkr else -amount_pkr end), 0)
    into net_paid from payments where invoice_id = new.invoice_id;

  if new.kind = 'payment' then
    if net_paid + new.amount_pkr > inv_total then
      raise exception 'Payment exceeds the remaining balance (balance %).', inv_total - net_paid
        using errcode = 'check_violation';
    end if;
  else
    select amount_pkr into ref_amount from payments
      where id = new.reverses_payment_id and invoice_id = new.invoice_id and kind = 'payment';
    if ref_amount is null then
      raise exception 'The referenced payment was not found on this invoice.' using errcode = 'check_violation';
    end if;
    select coalesce(sum(amount_pkr), 0) into ref_reversed from payments
      where reverses_payment_id = new.reverses_payment_id and kind = 'reversal';
    if new.amount_pkr > ref_amount - ref_reversed then
      raise exception 'Reversal exceeds the remaining reversible amount of that payment.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- ---- 3. investor payouts: lock the investor row before reading accrued + paid. ------------------
create or replace function guard_investor_payout()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_accrued      numeric;
  v_paid         numeric;
  v_ref_kind     payout_kind;
  v_ref_amt      numeric;
  v_ref_investor uuid;
  v_ref_rev      uuid;
begin
  if new.kind = 'reversal' then
    if new.reverses_id is null then
      raise exception 'A reversal must reference the payout it corrects.' using errcode = 'check_violation';
    end if;
    select kind, amount_pkr, investor_id, reverses_id into v_ref_kind, v_ref_amt, v_ref_investor, v_ref_rev
      from investor_payouts where id = new.reverses_id;
    if v_ref_kind is null then raise exception 'The payout being reversed was not found.' using errcode = 'check_violation'; end if;
    if v_ref_investor <> new.investor_id then raise exception 'A reversal must be for the same investor.' using errcode = 'check_violation'; end if;
    if new.kind = v_ref_kind then raise exception 'A reversal must be the opposite kind of the entry it corrects.' using errcode = 'check_violation'; end if;
    if new.amount_pkr <> v_ref_amt then raise exception 'A reversal must match the amount of the entry it corrects.' using errcode = 'check_violation'; end if;
    if v_ref_rev is not null then raise exception 'You cannot reverse a reversal row.' using errcode = 'check_violation'; end if;
  elsif new.reverses_id is not null then
    raise exception 'Only a reversal may reference another payout.' using errcode = 'check_violation';
  end if;

  -- C4: serialize concurrent payouts for this investor against the owed cap.
  perform 1 from investors where id = new.investor_id for update;

  select coalesce(sum(accrued_pkr), 0) into v_accrued from investor_sale_accrual where investor_id = new.investor_id;
  select coalesce(sum(case when kind = 'payout' then amount_pkr else -amount_pkr end), 0) into v_paid
    from investor_payouts where investor_id = new.investor_id;
  v_paid := v_paid + (case when new.kind = 'payout' then new.amount_pkr else -new.amount_pkr end);
  if v_paid > v_accrued then
    raise exception 'Payout exceeds the amount owed to this investor (owed %, payouts would total %).', v_accrued, v_paid using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---- 4. vendor advances: lock the vendor account row before reading the balance. ----------------
create or replace function guard_vendor_advance()
returns trigger language plpgsql security definer set search_path to 'public' as $$
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

  -- C4: serialize concurrent entries on this vendor account against the balance floor.
  perform 1 from vendor_accounts where id = new.vendor_account_id for update;

  select coalesce(sum(case when kind = 'topup' then amount_pkr else -amount_pkr end), 0)
    into v_balance from vendor_advance_entries where vendor_account_id = new.vendor_account_id;
  v_balance := v_balance + (case when new.kind = 'topup' then new.amount_pkr else -new.amount_pkr end);
  if v_balance < 0 then
    raise exception 'Draw-down exceeds the available advance balance.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
