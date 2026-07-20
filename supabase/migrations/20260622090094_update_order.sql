-- Edit an order's line items — but only in the SAFE window: before ANY line is delivered
-- (delivery draws stock via fulfil_order_line; rewriting a delivered line would desync
-- inventory + realized P&L) and not on a cancelled order. Mirrors create_order's tier pricing
-- (customer type drives the per-line default; an explicit price_pkr overrides). This is the
-- order analogue of update_invoice (090083): narrow, guarded, re-keys the lines atomically.
-- The delete is safe because an undelivered order has no sale stock_movements/corrections
-- referencing its items (both FKs are NO ACTION, so any real reference would block the delete).
create or replace function update_order(p_id uuid, p_items jsonb)
returns orders
language plpgsql security invoker set search_path = public as $$
declare
  v_order     orders;
  v_cust_type customer_type;
  v_item      jsonb;
begin
  select * into v_order from orders where id = p_id;
  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;
  if v_order.stage = 'cancelled' then
    raise exception 'A cancelled order cannot be edited.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from order_items where order_id = p_id and qty_delivered > 0) then
    raise exception 'This order already has delivered lines and cannot be edited.' using errcode = 'check_violation';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item.' using errcode = 'check_violation';
  end if;

  select type into v_cust_type from customers where id = v_order.customer_id;

  delete from order_items where order_id = p_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
    select p_id, p.id, p.name, p.sku, (v_item->>'qty')::int,
      coalesce(
        (v_item->>'price_pkr')::numeric,
        case when v_cust_type in ('trade', 'workshop') then coalesce(p.reseller_price_pkr, p.price_pkr, 0)
             else coalesce(p.price_pkr, 0) end
      )
    from products p
    where p.id = (v_item->>'product_id')::uuid;
    if not found then
      raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation';
    end if;
  end loop;

  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = p_id)
  where id = p_id
  returning * into v_order;

  return v_order;
end $$;

revoke all on function update_order(uuid, jsonb) from public;
grant execute on function update_order(uuid, jsonb) to authenticated;
