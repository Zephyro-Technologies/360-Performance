-- ===========================================================================
-- CRITICAL FIX: fulfil_order_line could not deliver a catalogue line at all.
--
-- 090035 defined draw_stock_fifo(product, qty, order_item, occurred_on) — 4 args — and
-- fulfil_order_line called it that way. Later work widened the allocator to 8 parameters
-- (kind, pr_gift_id, correction_id, note) so PR gifts and at-fault replacements could draw
-- stock through the same path, and 090070 updated fulfil_order_line to match, adding the
-- replacement-vs-sale branch.
--
-- 090109 (order one-off lines) then rebuilt fulfil_order_line from the ORIGINAL 090035 body.
-- It kept its own new one-off branch but reverted the catalogue branch to the 4-arg call:
--
--     perform draw_stock_fifo(v_line.product_id, p_qty, p_line_id, current_date);
--
-- That signature no longer exists, so EVERY delivery of a catalogue line failed outright with
-- 42883 "function draw_stock_fifo(uuid, integer, uuid, date) does not exist". Order fulfilment —
-- the path that draws stock and realizes revenue — has been broken since.
--
-- It also silently lost 090070's replacement branch, so a replacement re-ship would have booked
-- as a normal 'sale' (charging the customer's margin for goods sent free) had it run at all.
--
-- This is the same copy-forward-from-a-stale-body mistake as 090084 (which dropped
-- update_invoice's admin guard) and 090104. Restores 090070's branching inside 090109's body.
-- ===========================================================================

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
  v_remaining := v_line.qty - v_line.qty_delivered;
  if p_qty is null or p_qty <= 0 then raise exception 'Delivery quantity must be positive.' using errcode = 'check_violation'; end if;
  if p_qty > v_remaining then raise exception 'Only % left to deliver on this line.', v_remaining using errcode = 'check_violation'; end if;

  if v_line.product_id is null then
    -- One-off product line: no stock to draw; record the delivery in the immutable ledger
    -- (house-only money, folded into the P&L surfaces by 090109).
    insert into order_oneoff_deliveries (order_item_id, qty, delivered_on) values (p_line_id, p_qty, current_date);
  else
    -- A replacement order (spawned by an at-fault correction) draws a house-loss 'replacement'
    -- movement linked to its correction; every other order draws a 'sale'. Restored from 090070.
    select replaces_order_id into v_replaces from orders where id = v_line.order_id;
    if v_replaces is not null then
      select id into v_corr_id from corrections where replacement_order_id = v_line.order_id order by created_at limit 1;
      perform draw_stock_fifo(v_line.product_id, p_qty, 'replacement'::movement_kind, p_line_id, null, v_corr_id, current_date, 'at-fault replacement delivery');
    else
      perform draw_stock_fifo(v_line.product_id, p_qty, 'sale'::movement_kind, p_line_id, null, null, current_date, 'order delivery');
    end if;
  end if;

  update order_items set qty_delivered = qty_delivered + p_qty where id = p_line_id;

  select bool_and(qty_delivered >= qty), bool_or(qty_delivered > 0)
    into v_all_delivered, v_any_delivered from order_items where order_id = v_line.order_id;
  select stage into v_stage from orders where id = v_line.order_id;
  if v_stage <> 'cancelled' then
    if v_all_delivered and v_stage is distinct from 'delivered' then
      update orders set stage = 'delivered' where id = v_line.order_id;
    elsif v_any_delivered and not v_all_delivered and v_stage is distinct from 'partially_delivered' then
      update orders set stage = 'partially_delivered' where id = v_line.order_id;
    end if;
  end if;
end $$;

grant execute on function fulfil_order_line(uuid, int) to authenticated;
