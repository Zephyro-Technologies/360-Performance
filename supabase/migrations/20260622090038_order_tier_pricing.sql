-- ===========================================================================
-- Phase 5 — Reseller (internal) pricing on orders. customers.type now DRIVES the line
-- price: trade/workshop default to reseller_price_pkr (falling back to retail), retail to
-- retail. The operator can override any line (an explicit price_pkr in the item wins). This
-- is internal quoting — reseller pricing never reaches the anon storefront (products_public
-- excludes reseller_price_pkr; order/invoice snapshots are anon-revoked). The investor
-- carve-out (Phase 4) reads order_items.price_pkr, so an investor product sold at the
-- reseller price splits on the ACTUAL (reseller) margin — no special handling.
-- ===========================================================================
create or replace function create_order(
  p_customer_id uuid,
  p_new_customer jsonb,
  p_items jsonb,
  p_notes text
) returns orders
language plpgsql security invoker set search_path = public as $$
declare
  v_customer_id uuid := p_customer_id;
  v_cust_type   customer_type;
  v_order orders;
  v_item  jsonb;
begin
  if v_customer_id is null then
    if p_new_customer is null or coalesce(p_new_customer->>'name', '') = '' then
      raise exception 'A customer is required.' using errcode = 'check_violation';
    end if;
    insert into customers (name, type, email, phone, city)
    values (
      p_new_customer->>'name',
      case when p_new_customer->>'type' in ('retail', 'trade', 'workshop')
           then (p_new_customer->>'type')::customer_type else 'retail' end,
      nullif(p_new_customer->>'email', ''),
      nullif(p_new_customer->>'phone', ''),
      nullif(p_new_customer->>'city', '')
    )
    returning id into v_customer_id;
  end if;

  -- the customer's pricing tier (drives the per-line default)
  select type into v_cust_type from customers where id = v_customer_id;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item.' using errcode = 'check_violation';
  end if;

  insert into orders (customer_id, notes)
  values (v_customer_id, nullif(p_notes, ''))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    -- line price: explicit override wins; else the tier default for this customer type.
    insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
    select v_order.id, p.id, p.name, p.sku, (v_item->>'qty')::int,
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
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order.id)
  where id = v_order.id
  returning * into v_order;

  return v_order;
end $$;
