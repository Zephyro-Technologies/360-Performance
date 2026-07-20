-- ===========================================================================
-- record_po_payment — settle a PO line's item/shipping payment ATOMICALLY (audit hardening).
--
-- Fixes two residuals from the client-side flow:
--   * atomicity — the vendor-advance ledger entry and the line update happen in ONE transaction,
--     so a guard-rejected draw-down (over-drawing credit) rolls BOTH back; they can't desync.
--   * rounding — the line cost is computed here in exact numeric the SAME way as vendor_payables
--     (round(qty * unit_cost_rmb * rate) / round(qty * shipping_per_unit_pkr)), so a fully-paid
--     line never shows a sub-rupee "Partial".
--
-- Two modes: p_use_credit=true settles the remaining balance from the vendor's credit (a draw-down);
-- otherwise it records NEW money of p_amount — refunding any credit that had funded the line's prior
-- payment and, for ITEMS, banking the over-payment excess as credit (shipping never adds credit).
-- SECURITY INVOKER → the caller's RLS + the advance-balance guard still apply.
-- ===========================================================================
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

revoke execute on function record_po_payment(uuid, text, numeric, boolean, date) from public;
grant execute on function record_po_payment(uuid, text, numeric, boolean, date) to authenticated;
