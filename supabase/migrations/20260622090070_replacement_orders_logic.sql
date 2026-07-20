-- ===========================================================================
-- Replacement orders — deferred-draw behaviour (see 090069 for the columns).
--
-- 1) record_correction: a REPLACEMENT no longer draws stock. It spins up a new order at
--    'received' (linked back via replaces_order_id, priced at 0 = no revenue) so staff run
--    the re-delivery through the pipeline, and links it on corrections.replacement_order_id.
-- 2) fulfil_order_line: delivering a replacement order's line draws a 'replacement' movement
--    (house loss, FIFO, linked to the correction) instead of a 'sale' — so the loss is booked
--    when the replacement actually ships, and it never lands in sale_margin (kind='sale' only).
-- 3) Immutability + delete guards widen from kind='sale' to include kind='replacement', so a
--    delivered replacement line freezes and its order can't be hard-deleted (mirrors sales).
--
-- P&L stays consistent: corrections_loss (090050) already sums kind='replacement' movements ×
-- landed cost into operating_expense; the only change is TIMING (booked at re-delivery now).
-- ===========================================================================

-- 1) ------------------------------------------------------------------------------------------
create or replace function record_correction(
  p_order_id uuid, p_order_item_id uuid, p_action correction_action, p_amount_pkr numeric,
  p_product_id uuid, p_qty int, p_wrong_unit_disposition wrong_unit_disposition,
  p_payment_id uuid, p_method payment_method, p_reason text, p_notes text
) returns corrections
language plpgsql security definer set search_path = public as $$
declare
  v_corr       corrections;
  v_owner      owner_kind;
  v_inv        uuid;
  v_pay_order  uuid;
  v_order      orders;
  v_repl_order uuid;
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
  select * into v_order from orders where id = p_order_id;
  if v_order.id is null then raise exception 'Order not found.' using errcode = 'check_violation'; end if;

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
    -- Deferred re-ship: create the pipeline order (no stock drawn yet). Its line is priced at 0
    -- (no revenue); the house loss is booked when the line is delivered (fulfil_order_line).
    insert into orders (customer_id, stage, replaces_order_id, notes)
    values (
      v_order.customer_id, 'received', v_order.id,
      'Replacement for ' || coalesce(v_order.order_no, 'order') || ' (' || v_corr.correction_no || '): ' || p_reason
    )
    returning id into v_repl_order;

    insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
    select v_repl_order, p.id, p.name, p.sku, p_qty, 0 from products p where p.id = p_product_id;

    update orders set total_pkr = 0 where id = v_repl_order;
    update corrections set replacement_order_id = v_repl_order where id = v_corr.id;
    v_corr.replacement_order_id := v_repl_order;
  elsif p_action = 'refund' then
    -- reverse the customer payment (immutable ledger; guard caps over-reversal / voided invoice)
    insert into payments (invoice_id, amount_pkr, method, kind, reverses_payment_id)
    values (v_inv, p_amount_pkr, coalesce(p_method, 'other'::payment_method), 'reversal', p_payment_id);
  end if;

  return v_corr;
end $$;

-- 2) ------------------------------------------------------------------------------------------
create or replace function fulfil_order_line(p_line_id uuid, p_qty int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_line          order_items%rowtype;
  v_remaining     int;
  v_all_delivered boolean;
  v_any_delivered boolean;
  v_stage         order_stage;
  v_replaces      uuid;
  v_corr_id       uuid;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to fulfil orders.' using errcode = 'check_violation';
  end if;
  select * into v_line from order_items where id = p_line_id;
  if v_line.id is null then raise exception 'Order line not found.' using errcode = 'check_violation'; end if;
  if v_line.product_id is null then
    raise exception 'This line has no linked product to draw stock from.' using errcode = 'check_violation';
  end if;
  v_remaining := v_line.qty - v_line.qty_delivered;
  if p_qty is null or p_qty <= 0 then raise exception 'Delivery quantity must be positive.' using errcode = 'check_violation'; end if;
  if p_qty > v_remaining then
    raise exception 'Only % left to deliver on this line.', v_remaining using errcode = 'check_violation';
  end if;

  -- A replacement order (spawned by an at-fault correction) draws a house-loss 'replacement'
  -- movement linked to its correction; every other order draws a 'sale'.
  select replaces_order_id into v_replaces from orders where id = v_line.order_id;
  if v_replaces is not null then
    select id into v_corr_id from corrections where replacement_order_id = v_line.order_id order by created_at limit 1;
    perform draw_stock_fifo(v_line.product_id, p_qty, 'replacement'::movement_kind, p_line_id, null, v_corr_id, current_date, 'at-fault replacement delivery');
  else
    perform draw_stock_fifo(v_line.product_id, p_qty, 'sale'::movement_kind, p_line_id, null, null, current_date, 'order delivery');
  end if;

  update order_items set qty_delivered = qty_delivered + p_qty where id = p_line_id;

  select bool_and(qty_delivered >= qty), bool_or(qty_delivered > 0)
    into v_all_delivered, v_any_delivered
    from order_items where order_id = v_line.order_id;
  select stage into v_stage from orders where id = v_line.order_id;
  if v_stage <> 'cancelled' then
    if v_all_delivered and v_stage is distinct from 'delivered' then
      update orders set stage = 'delivered' where id = v_line.order_id;
    elsif v_any_delivered and not v_all_delivered and v_stage is distinct from 'partially_delivered' then
      update orders set stage = 'partially_delivered' where id = v_line.order_id;
    end if;
  end if;
end $$;

-- 3) ------------------------------------------------------------------------------------------
-- Freeze a (partly) delivered line's realized terms — now for replacement draws too.
create or replace function freeze_drawn_order_item()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_drawn boolean := exists (select 1 from stock_movements where order_item_id = old.id and kind in ('sale', 'replacement'));
begin
  if v_drawn then
    if new.price_pkr is distinct from old.price_pkr then
      raise exception 'This line has already been delivered (in part) — its price is frozen. Record an at-fault correction instead of editing realized revenue.'
        using errcode = 'check_violation';
    end if;
    if new.product_id is distinct from old.product_id then
      raise exception 'This line has already been delivered (in part) — its product is frozen (it fixes the owner / investor split of the realized sale).'
        using errcode = 'check_violation';
    end if;
    if new.order_id is distinct from old.order_id then
      raise exception 'This line has already been delivered (in part) — it cannot be moved to another order.'
        using errcode = 'check_violation';
    end if;
    if new.qty_delivered < old.qty_delivered then
      raise exception 'Delivered quantity cannot be reduced on a line with realized sales — unwind through the at-fault corrections tool.'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.qty < new.qty_delivered then
    raise exception 'Cannot reduce quantity below the % already delivered on this line.', new.qty_delivered
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- A drawn line (sale OR replacement) cannot be deleted; a drawn order cannot be hard-deleted.
drop policy if exists order_items_del on order_items;
create policy order_items_del on order_items for delete to authenticated
  using (has_role(array['admin', 'staff']::user_role[])
         and not exists (select 1 from stock_movements sm
                         where sm.order_item_id = order_items.id and sm.kind in ('sale', 'replacement')));

drop policy if exists orders_del on orders;
create policy orders_del on orders for delete to authenticated
  using (has_role(array['admin']::user_role[])
         and not exists (select 1 from order_items oi
                         join stock_movements sm on sm.order_item_id = oi.id
                         where oi.order_id = orders.id and sm.kind in ('sale', 'replacement')));
