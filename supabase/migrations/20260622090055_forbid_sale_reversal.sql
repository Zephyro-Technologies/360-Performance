-- ============================================================================
-- Fix Group 2 (H3) — forbid raw reversal of ECONOMIC stock movements.
--
-- sale / pr_gift / replacement movements carry realized value that the money views COUNT but never
-- NET: sale_margin / order_cogs / investor_sale_accrual filter kind='sale'; marketing_spend filters
-- kind='pr_gift'; corrections_loss filters kind='replacement' — NONE subtracts a kind='reversal'.
-- Only batch_on_hand nets reversals (quantity-only). So a raw admin reversal RESTORES the stock but
-- leaves the revenue / COGS / marketing / loss counted — re-selling the unit DOUBLE-BOOKS it.
--
-- Fix: guard_stock_movement now forbids reversing an economic movement. Sale-unwinding routes
-- through the Phase-9 at-fault ledger (the correct, additive, already-netted path — record_correction).
-- Reversal stays legal ONLY for the pure-inventory kinds (receive / adjust_add / adjust_remove),
-- which no money view reads, so netting them in batch_on_hand is complete and safe.
--
-- This only TIGHTENS the append-only guard — no money-view SQL and no RPC body changes. The false
-- "…nets it / need not net" comments in 090035 / 090042 / 090050 are corrected in place.
-- ============================================================================
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
    -- H3: economic movements carry realized value the money views count but never net — reversing
    -- one would double-count on re-sale. Unwind a sale through the at-fault corrections tool instead.
    if v_ref_kind in ('sale', 'pr_gift', 'replacement') then
      raise exception 'A % movement cannot be reversed — unwind it through the at-fault corrections tool, not a raw stock reversal.',
        v_ref_kind using errcode = 'check_violation';
    end if;
  elsif new.reverses_id is not null then
    raise exception 'Only a reversal may reference another movement.' using errcode = 'check_violation';
  end if;

  -- LOCKED: PR gifts + at-fault replacements use house stock only — never an investor's capital.
  if new.kind in ('pr_gift', 'replacement') then
    select p.owner_kind into v_owner from batches ba join products p on p.id = ba.product_id where ba.id = new.batch_id;
    if v_owner is distinct from 'house' then
      raise exception '% can only use house stock, not investor stock.',
        case when new.kind = 'pr_gift' then 'PR gifts' else 'At-fault replacements' end using errcode = 'check_violation';
    end if;
  end if;

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
