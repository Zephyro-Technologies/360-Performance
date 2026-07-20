-- ===========================================================================
-- Phase 3 — Order & fulfilment restructure. Closes the loop opened in Phase 2:
-- delivering a customer-order LINE now draws batch stock (FIFO) and rolls the order up.
--   * order_items gains per-line fulfilment (qty_delivered) + a sourced-to-order PO link
--   * stock_movements.order_item_id ties a `sale` movement to its order line (COGS + Phase 4)
--   * draw_stock_fifo() — the REUSABLE FIFO allocator (oldest batch first); each sale
--     movement records its batch's ACTUAL landed cost (specific-identification, not a blend),
--     which Phase 4 reuses unchanged for investor capital (ownership is per product = per owner)
--   * fulfil_order_line() — the per-line deliver RPC (draws stock, advances qty_delivered,
--     rolls up orders.stage). Overselling blocked (pre-check + the Phase 2 per-batch guard).
--   * order_cogs — per-line COGS, queryable. Phase 3 RECORDS cost; Phase 4 re-bases the P&L.
-- ===========================================================================

-- ---- per-line fulfilment --------------------------------------------------
alter table order_items
  add column qty_delivered             int  not null default 0,
  add column source_purchase_order_id  uuid references purchase_orders(id) on delete set null;
alter table order_items add constraint order_items_delivered_range
  check (qty_delivered >= 0 and qty_delivered <= qty);
create index order_items_source_po_idx on order_items(source_purchase_order_id);

-- a `sale` movement belongs to the order line it delivered (COGS-per-line; Phase 4 settlement)
alter table stock_movements
  add column order_item_id uuid references order_items(id) on delete set null;
create index stock_movements_order_item_idx on stock_movements(order_item_id);

-- ---- reusable FIFO stock draw ---------------------------------------------
-- Consumes p_qty of a product oldest-batch-first, posting one `sale` movement per batch
-- touched (each carrying that batch's actual landed cost). Internal building block — only
-- callable through a SECURITY DEFINER caller (e.g. fulfil_order_line); the caller does authz.
create or replace function draw_stock_fifo(p_product_id uuid, p_qty int, p_order_item_id uuid, p_occurred_on date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_need  int := p_qty;
  v_avail int;
  v_take  int;
  b       record;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Delivery quantity must be positive.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(remaining), 0) into v_avail from batch_on_hand where product_id = p_product_id;
  if v_avail < p_qty then
    raise exception 'Not enough stock: % on hand, % requested.', v_avail, p_qty using errcode = 'check_violation';
  end if;

  for b in
    select boh.batch_id, boh.remaining
    from batch_on_hand boh
    join batches ba on ba.id = boh.batch_id
    where boh.product_id = p_product_id and boh.remaining > 0
    order by ba.received_on asc, ba.created_at asc, ba.id asc   -- FIFO: oldest batch first
  loop
    exit when v_need <= 0;
    v_take := least(b.remaining, v_need);
    insert into stock_movements (batch_id, kind, qty, order_item_id, occurred_on, note)
      values (b.batch_id, 'sale', v_take, p_order_item_id, p_occurred_on, 'order delivery');
    v_need := v_need - v_take;
  end loop;

  if v_need > 0 then
    raise exception 'Stock allocation failed (% units short).', v_need using errcode = 'check_violation';
  end if;
end $$;

-- ---- per-line deliver RPC -------------------------------------------------
create or replace function fulfil_order_line(p_line_id uuid, p_qty int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_line          order_items%rowtype;
  v_remaining     int;
  v_all_delivered boolean;
  v_any_delivered boolean;
  v_stage         order_stage;
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

  -- draw stock FIFO (posts the sale movements, each recording its batch's actual cost)
  perform draw_stock_fifo(v_line.product_id, p_qty, p_line_id, current_date);

  update order_items set qty_delivered = qty_delivered + p_qty where id = p_line_id;

  -- roll up: all lines delivered -> delivered; some -> partially_delivered (never override cancelled)
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

-- ---- COGS (recorded, queryable — NOT yet wired into analytics_daily; that's Phase 4) ------
-- Per order line: units sold and their actual batch cost. Sale movements are UN-REVERSIBLE
-- (guard_stock_movement forbids kind='reversal' on a 'sale' — Fix Group 2, migration 090055); a
-- sale is unwound only through the Phase-9 at-fault ledger, so this view has no reversal to net.
create view order_cogs as
select sm.order_item_id, oi.order_id,
  sum(sm.qty)                         as qty_sold,
  sum(sm.qty * ba.landed_cost_pkr)    as cogs_pkr
from stock_movements sm
join batches     ba on ba.id = sm.batch_id
join order_items oi on oi.id = sm.order_item_id
where sm.kind = 'sale'
group by sm.order_item_id, oi.order_id;

-- grants / anon-hardening
grant execute on function fulfil_order_line(uuid, int) to authenticated;
revoke execute on function draw_stock_fifo(uuid, int, uuid, date) from public;  -- internal-only
grant select on order_cogs to authenticated;
revoke all on order_cogs from anon;
