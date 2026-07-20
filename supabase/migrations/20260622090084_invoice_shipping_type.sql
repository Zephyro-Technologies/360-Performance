-- Add line-item shipping type to invoices and keep the create/update RPCs in sync.
-- Sea/Air is now captured on every invoice line and printed back in the document.

alter table invoice_items
  add column shipping_type text not null default 'sea' check (shipping_type in ('sea', 'air'));

create or replace function create_invoice(
  p_customer_id uuid,
  p_new_customer jsonb,
  p_order_id uuid,
  p_items jsonb,
  p_due_date date
) returns invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_customer_id uuid := p_customer_id;
  v_cust_type   customer_type;
  v_inv         invoices;
  v_item        jsonb;
  v_subtotal    numeric;
  v_rate        numeric;
  v_inclusive   boolean;
  v_tax         numeric;
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

  select type into v_cust_type from customers where id = v_customer_id;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An invoice needs at least one item.' using errcode = 'check_violation';
  end if;

  insert into invoices (customer_id, order_id, due_date)
  values (v_customer_id, p_order_id, p_due_date)
  returning * into v_inv;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    insert into invoice_items (invoice_id, product_id, name, sku, qty, price_pkr, shipping_type)
    select v_inv.id, p.id, p.name, p.sku, (v_item->>'qty')::int,
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
  end loop;

  select coalesce(sum(qty * price_pkr), 0) into v_subtotal from invoice_items where invoice_id = v_inv.id;
  select tax_rate, tax_inclusive into v_rate, v_inclusive from settings where id = true;
  if coalesce(v_inclusive, false) then
    raise exception 'Inclusive tax is not configured yet.' using errcode = 'check_violation';
  end if;
  v_tax := round(v_subtotal * coalesce(v_rate, 0), 2);

  update invoices
  set subtotal_pkr = v_subtotal, tax_pkr = v_tax, total_pkr = v_subtotal + v_tax
  where id = v_inv.id
  returning * into v_inv;

  return v_inv;
end $$;

create or replace function update_invoice(p_id uuid, p_items jsonb)
returns invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_inv invoices;
  v_item jsonb;
  v_subtotal numeric;
  v_rate numeric;
  v_inclusive boolean;
  v_tax numeric;
begin
  select * into v_inv from invoices where id = p_id;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'no_data_found';
  end if;
  if v_inv.voided_at is not null then
    raise exception 'This invoice is voided and cannot be edited.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from payments where invoice_id = p_id) then
    raise exception 'This invoice already has a payment and cannot be edited.' using errcode = 'check_violation';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An invoice needs at least one item.' using errcode = 'check_violation';
  end if;

  delete from invoice_items where invoice_id = p_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    insert into invoice_items (invoice_id, product_id, name, sku, qty, price_pkr, shipping_type)
    select p_id, p.id, p.name, p.sku, (v_item->>'qty')::int,
      coalesce(
        (v_item->>'price_pkr')::numeric,
        case when exists (select 1 from customers c where c.id = v_inv.customer_id and c.type in ('trade', 'workshop'))
             then coalesce(p.reseller_price_pkr, p.price_pkr, 0)
             else coalesce(p.price_pkr, 0) end
      ),
      coalesce(nullif(v_item->>'shipping_type', ''), 'sea')
    from products p where p.id = (v_item->>'product_id')::uuid;
    if not found then
      raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation';
    end if;
  end loop;

  select coalesce(sum(qty * price_pkr), 0) into v_subtotal from invoice_items where invoice_id = p_id;
  select tax_rate, tax_inclusive into v_rate, v_inclusive from settings where id = true;
  if coalesce(v_inclusive, false) then
    raise exception 'Inclusive tax is not configured yet.' using errcode = 'check_violation';
  end if;
  v_tax := round(v_subtotal * coalesce(v_rate, 0), 2);

  update invoices
  set subtotal_pkr = v_subtotal, tax_pkr = v_tax, total_pkr = v_subtotal + v_tax
  where id = p_id
  returning * into v_inv;

  return v_inv;
end $$;
