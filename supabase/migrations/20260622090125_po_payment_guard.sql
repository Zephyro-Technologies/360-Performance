-- ===========================================================================
-- P1 (integrity) — PO-line payment columns can ONLY be written by record_po_payment().
--
-- record_po_payment() settles a line AND posts the matching vendor-advance entry in one txn.
-- But pol_write RLS (090033) also let staff UPDATE the line's payment columns directly, which
-- would settle the line WITHOUT the ledger entry — desyncing payables and prepaid credit
-- silently. This guard rejects any UPDATE that touches a payment column unless it comes from
-- record_po_payment(), which now sets a transaction-local flag the guard checks. Non-payment
-- edits (qty_received, freight_vendor_id, cost, …) are unaffected.
-- ===========================================================================

create or replace function guard_po_line_payment() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.po_payment_ctx', true), '') <> '1'
     and (
       new.item_paid_amount_pkr  is distinct from old.item_paid_amount_pkr  or
       new.ship_paid_amount_pkr  is distinct from old.ship_paid_amount_pkr  or
       new.item_credit_added_pkr is distinct from old.item_credit_added_pkr or
       new.item_paid_from_credit is distinct from old.item_paid_from_credit or
       new.ship_paid_from_credit is distinct from old.ship_paid_from_credit or
       new.item_paid_on          is distinct from old.item_paid_on          or
       new.ship_paid_on          is distinct from old.ship_paid_on
     ) then
    raise exception 'PO-line payments must be recorded through record_po_payment().' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger guard_po_line_payment before update on purchase_order_lines
  for each row execute function guard_po_line_payment();

-- ---- re-create record_po_payment: body verbatim from 090079, with the flag set up front ------
create or replace function record_po_payment(
  p_line_id uuid, p_kind text, p_amount numeric, p_use_credit boolean, p_occurred_on date
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_line      purchase_order_lines%rowtype;
  v_rate      numeric;
  v_supplier  uuid;
  v_po_no     text;
  v_vacct     uuid;
  v_cost      numeric;
  v_prior     numeric;
  v_from      boolean;
  v_overpay   numeric := 0;
  v_on        date := coalesce(p_occurred_on, current_date);
  v_remaining numeric;
  v_applied   numeric;
  v_newcredit numeric := 0;
  v_delta     numeric;
begin
  -- txn-local: authorises this function's writes to the PO-line payment columns (guard checks it).
  perform set_config('app.po_payment_ctx', '1', true);

  if p_kind not in ('item', 'ship') then raise exception 'Invalid payment kind.' using errcode = 'check_violation'; end if;
  select * into v_line from purchase_order_lines where id = p_line_id;
  if v_line.id is null then raise exception 'Order line not found.' using errcode = 'check_violation'; end if;
  select po.supplier_id, po.frozen_rate_rmb_pkr, po.po_no into v_supplier, v_rate, v_po_no
    from purchase_orders po where po.id = v_line.purchase_order_id;
  select id into v_vacct from vendor_accounts where supplier_id = v_supplier;

  if p_kind = 'item' then
    if v_rate is null then raise exception 'Set the PO''s RMB rate before paying for items.' using errcode = 'check_violation'; end if;
    v_cost := round(v_line.qty_ordered * v_line.unit_cost_rmb * v_rate);
    v_prior := coalesce(v_line.item_paid_amount_pkr, 0);
    v_from := v_line.item_paid_from_credit;
    v_overpay := coalesce(v_line.item_credit_added_pkr, 0);
  else
    v_cost := round(v_line.qty_ordered * v_line.shipping_per_unit_pkr);
    v_prior := coalesce(v_line.ship_paid_amount_pkr, 0);
    v_from := v_line.ship_paid_from_credit;
  end if;

  if p_use_credit then
    v_remaining := greatest(v_cost - v_prior, 0);
    if v_remaining <= 0 then raise exception 'Nothing left to pay on this line.' using errcode = 'check_violation'; end if;
    if v_vacct is null then raise exception 'This supplier has no vendor account.' using errcode = 'check_violation'; end if;
    insert into vendor_advance_entries (vendor_account_id, kind, amount_pkr, purchase_order_id, occurred_on, note)
      values (v_vacct, 'drawdown', v_remaining, v_line.purchase_order_id, v_on, 'Credit applied to ' || coalesce(v_po_no, 'order') || ' · ' || p_kind);
    if p_kind = 'item' then
      update purchase_order_lines set item_paid_amount_pkr = v_cost, item_paid_on = v_on, item_paid_from_credit = true where id = p_line_id;
    else
      update purchase_order_lines set ship_paid_amount_pkr = v_cost, ship_paid_on = v_on, ship_paid_from_credit = true where id = p_line_id;
    end if;
  else
    v_applied := least(round(p_amount), v_cost);
    if p_kind = 'item' then v_newcredit := greatest(round(p_amount) - v_cost, 0); end if;
    v_delta := (case when v_from then v_prior else 0 end) + v_newcredit - v_overpay; -- >0 top-up, <0 draw-down
    if v_delta <> 0 then
      if v_vacct is null then raise exception 'This supplier has no vendor account.' using errcode = 'check_violation'; end if;
      insert into vendor_advance_entries (vendor_account_id, kind, amount_pkr, purchase_order_id, occurred_on, note)
        values (v_vacct, (case when v_delta > 0 then 'topup' else 'drawdown' end)::advance_kind, abs(v_delta), v_line.purchase_order_id, v_on,
                'Credit adjustment on ' || coalesce(v_po_no, 'order') || ' · ' || p_kind);
    end if;
    if p_kind = 'item' then
      update purchase_order_lines
        set item_paid_amount_pkr = nullif(v_applied, 0), item_paid_on = case when round(p_amount) > 0 then v_on else null end,
            item_credit_added_pkr = v_newcredit, item_paid_from_credit = false
        where id = p_line_id;
    else
      update purchase_order_lines
        set ship_paid_amount_pkr = nullif(v_applied, 0), ship_paid_on = case when round(p_amount) > 0 then v_on else null end,
            ship_paid_from_credit = false
        where id = p_line_id;
    end if;
  end if;
end $$;

revoke execute on function record_po_payment(uuid, text, numeric, boolean, date) from public, anon;
grant execute on function record_po_payment(uuid, text, numeric, boolean, date) to authenticated;
