-- ===========================================================================
-- Phase 9 — record_correction: the ONE server-authoritative, atomic path for at-fault
-- corrections. Posts the ledger row AND its side effect in one transaction:
--   * replacement -> draw_stock_fifo(kind='replacement') (house-stock-only, guarded)
--   * refund      -> a payment REVERSAL row (reuse the exact pattern; over-reversal-guarded)
--   * compensation-> nothing but the ledger amount (a goodwill house loss)
-- Refunds are ADMIN-ONLY (matching the payments reversal policy); replace/compensate are staff+.
-- The original sale is never touched, so investor settlement is never reversed.
-- ===========================================================================
create or replace function record_correction(
  p_order_id uuid, p_order_item_id uuid, p_action correction_action, p_amount_pkr numeric,
  p_product_id uuid, p_qty int, p_wrong_unit_disposition wrong_unit_disposition,
  p_payment_id uuid, p_method payment_method, p_reason text, p_notes text
) returns corrections
language plpgsql security definer set search_path = public as $$
declare
  v_corr      corrections;
  v_owner     owner_kind;
  v_inv       uuid;
  v_pay_order uuid;
begin
  -- Authz: a refund reverses a customer payment -> ADMIN-ONLY (matches payments_ins reversal policy).
  if p_action = 'refund' then
    if not has_role(array['admin']::user_role[]) then
      raise exception 'Only an admin can record a refund.' using errcode = 'check_violation';
    end if;
  else
    if not has_role(array['admin','staff']::user_role[]) then
      raise exception 'You do not have permission to record corrections.' using errcode = 'check_violation';
    end if;
  end if;

  if coalesce(p_reason, '') = '' then raise exception 'A correction needs a reason.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from orders where id = p_order_id) then raise exception 'Order not found.' using errcode = 'check_violation'; end if;

  if p_action = 'replacement' then
    if p_product_id is null or coalesce(p_qty, 0) <= 0 then
      raise exception 'A replacement needs a product and a quantity.' using errcode = 'check_violation';
    end if;
    select owner_kind into v_owner from products where id = p_product_id;
    if v_owner is null then raise exception 'Product not found.' using errcode = 'check_violation'; end if;
    if v_owner <> 'house' then
      raise exception 'At-fault replacements can only use house stock — refund or compensate an investor item instead.' using errcode = 'check_violation';
    end if;
  else
    if coalesce(p_amount_pkr, 0) <= 0 then raise exception 'Enter an amount greater than zero.' using errcode = 'check_violation'; end if;
    if p_action = 'refund' then
      if p_payment_id is null then raise exception 'Choose the payment to refund.' using errcode = 'check_violation'; end if;
      select invoice_id into v_inv from payments where id = p_payment_id and kind = 'payment';
      if v_inv is null then raise exception 'The payment to refund was not found.' using errcode = 'check_violation'; end if;
      select order_id into v_pay_order from invoices where id = v_inv;
      if v_pay_order is distinct from p_order_id then
        raise exception 'That payment is not on this order''s invoice.' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  insert into corrections (order_id, order_item_id, action, amount_pkr, product_id, qty, wrong_unit_disposition, reason, notes)
  values (
    p_order_id, p_order_item_id, p_action,
    case when p_action = 'replacement' then null else p_amount_pkr end,
    case when p_action = 'replacement' then p_product_id else null end,
    case when p_action = 'replacement' then p_qty else null end,
    case when p_action = 'replacement' then coalesce(p_wrong_unit_disposition, 'written_off') else null end,
    p_reason, nullif(p_notes, '')
  )
  returning * into v_corr;

  if p_action = 'replacement' then
    -- re-ship the correct unit free (house stock only, FIFO) — house loss = its landed cost
    perform draw_stock_fifo(p_product_id, p_qty, 'replacement'::movement_kind, null, null, v_corr.id, current_date, 'at-fault replacement ' || v_corr.correction_no);
  elsif p_action = 'refund' then
    -- reverse the customer payment (immutable ledger; guard caps over-reversal / voided invoice)
    insert into payments (invoice_id, amount_pkr, method, kind, reverses_payment_id)
    values (v_inv, p_amount_pkr, coalesce(p_method, 'other'::payment_method), 'reversal', p_payment_id);
  end if;

  return v_corr;
end $$;

grant execute on function record_correction(uuid, uuid, correction_action, numeric, uuid, int, wrong_unit_disposition, uuid, payment_method, text, text) to authenticated;
