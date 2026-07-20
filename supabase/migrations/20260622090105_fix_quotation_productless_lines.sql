-- ===========================================================================
-- FIX: product-less lines for quotations (same regression as invoices, 090097).
-- create_quotation / update_quotation (090087) were copied from the product-only invoice body
-- and never got the product-less branch, so a build one-off part (no product_id) hit
-- "Product not found: ". This re-adds the branch to both, carrying brand + shipping_type.
-- ===========================================================================

create or replace function create_quotation(
  p_customer_id uuid, p_new_customer jsonb, p_order_id uuid, p_items jsonb, p_notes text
) returns quotations
language plpgsql security invoker set search_path = public as $$
declare
  v_customer_id uuid := p_customer_id;
  v_cust_type   customer_type;
  v_quo         quotations;
  v_item        jsonb;
  v_subtotal    numeric;
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
      nullif(p_new_customer->>'email', ''), nullif(p_new_customer->>'phone', ''), nullif(p_new_customer->>'city', '')
    )
    returning id into v_customer_id;
  end if;

  select type into v_cust_type from customers where id = v_customer_id;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A quotation needs at least one item.' using errcode = 'check_violation';
  end if;

  insert into quotations (customer_id, order_id, notes)
  values (v_customer_id, p_order_id, nullif(btrim(coalesce(p_notes, '')), ''))
  returning * into v_quo;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    if coalesce(v_item->>'product_id', '') = '' then
      if coalesce(v_item->>'name', '') = '' then
        raise exception 'A line without a product needs a name.' using errcode = 'check_violation';
      end if;
      insert into quotation_items (quotation_id, product_id, name, sku, brand, qty, price_pkr, shipping_type)
      values (v_quo.id, null, v_item->>'name', nullif(v_item->>'sku', ''), nullif(v_item->>'brand', ''),
              (v_item->>'qty')::int, coalesce((v_item->>'price_pkr')::numeric, 0),
              coalesce(nullif(v_item->>'shipping_type', ''), 'sea'));
    else
      insert into quotation_items (quotation_id, product_id, name, sku, brand, qty, price_pkr, shipping_type)
      select v_quo.id, p.id, p.name, p.sku, p.brand, (v_item->>'qty')::int,
        coalesce(
          (v_item->>'price_pkr')::numeric,
          case when v_cust_type in ('trade', 'workshop') then coalesce(p.reseller_price_pkr, p.price_pkr, 0)
               else coalesce(p.price_pkr, 0) end
        ),
        coalesce(nullif(v_item->>'shipping_type', ''), 'sea')
      from products p
      where p.id = (v_item->>'product_id')::uuid;
      if not found then
        raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  select coalesce(sum(qty * price_pkr), 0) into v_subtotal from quotation_items where quotation_id = v_quo.id;
  update quotations set subtotal_pkr = v_subtotal, total_pkr = v_subtotal where id = v_quo.id returning * into v_quo;
  return v_quo;
end $$;

create or replace function update_quotation(p_id uuid, p_items jsonb, p_notes text)
returns quotations
language plpgsql security invoker set search_path = public as $$
declare
  v_quo quotations;
  v_item jsonb;
  v_subtotal numeric;
begin
  select * into v_quo from quotations where id = p_id;
  if not found then raise exception 'Quotation not found.' using errcode = 'no_data_found'; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A quotation needs at least one item.' using errcode = 'check_violation';
  end if;

  delete from quotation_items where quotation_id = p_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    if coalesce(v_item->>'product_id', '') = '' then
      if coalesce(v_item->>'name', '') = '' then
        raise exception 'A line without a product needs a name.' using errcode = 'check_violation';
      end if;
      insert into quotation_items (quotation_id, product_id, name, sku, brand, qty, price_pkr, shipping_type)
      values (p_id, null, v_item->>'name', nullif(v_item->>'sku', ''), nullif(v_item->>'brand', ''),
              (v_item->>'qty')::int, coalesce((v_item->>'price_pkr')::numeric, 0),
              coalesce(nullif(v_item->>'shipping_type', ''), 'sea'));
    else
      insert into quotation_items (quotation_id, product_id, name, sku, brand, qty, price_pkr, shipping_type)
      select p_id, p.id, p.name, p.sku, p.brand, (v_item->>'qty')::int,
        coalesce(
          (v_item->>'price_pkr')::numeric,
          case when exists (select 1 from customers c where c.id = v_quo.customer_id and c.type in ('trade', 'workshop'))
               then coalesce(p.reseller_price_pkr, p.price_pkr, 0)
               else coalesce(p.price_pkr, 0) end
        ),
        coalesce(nullif(v_item->>'shipping_type', ''), 'sea')
      from products p where p.id = (v_item->>'product_id')::uuid;
      if not found then
        raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  select coalesce(sum(qty * price_pkr), 0) into v_subtotal from quotation_items where quotation_id = p_id;
  update quotations set subtotal_pkr = v_subtotal, total_pkr = v_subtotal,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_id returning * into v_quo;
  return v_quo;
end $$;
