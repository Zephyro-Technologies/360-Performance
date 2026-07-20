-- ===========================================================================
-- Phase 7 — build RPCs. create_build makes the header + (if it has catalogue lines) a BACKING
-- ORDER via the UNCHANGED create_order, so catalogue consumption rides the normal sale path
-- (fulfil_order_line -> draw_stock_fifo kind='sale' -> COGS + the Phase 4 carve-out, verbatim).
-- One-off imported parts are inserted into build_lines (no product, no batch, no movement).
-- ===========================================================================

-- Create a build: resolve/creates the customer, spins a backing order for catalogue lines (each
-- an explicit build sale price), and records one-off imported-part lines.
create or replace function create_build(
  p_customer_id uuid, p_new_customer jsonb, p_name text, p_vehicle text,
  p_catalogue_items jsonb, p_oneoff_lines jsonb, p_notes text
) returns builds
language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid := p_customer_id;
  v_order       orders;
  v_order_id    uuid;
  v_build       builds;
  v_line        jsonb;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to create builds.' using errcode = 'check_violation';
  end if;
  if coalesce(p_name, '') = '' then
    raise exception 'A build needs a name.' using errcode = 'check_violation';
  end if;

  if v_customer_id is null then
    if p_new_customer is null or coalesce(p_new_customer->>'name', '') = '' then
      raise exception 'A customer is required.' using errcode = 'check_violation';
    end if;
    insert into customers (name, type, email, phone, city)
    values (
      p_new_customer->>'name',
      case when p_new_customer->>'type' in ('retail', 'trade', 'workshop') then (p_new_customer->>'type')::customer_type else 'retail' end,
      nullif(p_new_customer->>'email', ''), nullif(p_new_customer->>'phone', ''), nullif(p_new_customer->>'city', '')
    )
    returning id into v_customer_id;
  end if;

  -- Backing order for catalogue lines only (all-one-off builds carry order_id = NULL).
  if p_catalogue_items is not null and jsonb_array_length(p_catalogue_items) > 0 then
    v_order := create_order(v_customer_id, null, p_catalogue_items, p_notes);
    v_order_id := v_order.id;
  end if;

  insert into builds (customer_id, name, vehicle, order_id, status, notes)
  values (v_customer_id, p_name, nullif(p_vehicle, ''), v_order_id, 'sourcing', nullif(p_notes, ''))
  returning * into v_build;

  if p_oneoff_lines is not null then
    for v_line in select * from jsonb_array_elements(p_oneoff_lines) loop
      if coalesce(v_line->>'name', '') = '' then
        raise exception 'A one-off part needs a name.' using errcode = 'check_violation';
      end if;
      insert into build_lines (build_id, name, oem_part_no, supplier_id, qty, landed_cost_pkr, sale_price_pkr, notes)
      values (
        v_build.id, v_line->>'name', nullif(v_line->>'oem_part_no', ''),
        nullif(v_line->>'supplier_id', '')::uuid,
        coalesce((v_line->>'qty')::int, 1),
        coalesce((v_line->>'landed_cost_pkr')::numeric, 0),
        coalesce((v_line->>'sale_price_pkr')::numeric, 0),
        nullif(v_line->>'notes', '')
      );
    end loop;
  end if;

  return v_build;
end $$;

-- Append a catalogue line to a build after creation (creates the backing order on first use).
-- The order_item then delivers via the normal fulfil path; carve-out applies if it's investor stock.
create or replace function add_build_catalogue_line(p_build_id uuid, p_product_id uuid, p_qty int, p_sale_price_pkr numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_build    builds;
  v_order_id uuid;
  v_item     uuid;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to edit builds.' using errcode = 'check_violation';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
  end if;
  select * into v_build from builds where id = p_build_id;
  if v_build.id is null then raise exception 'Build not found.' using errcode = 'check_violation'; end if;

  v_order_id := v_build.order_id;
  if v_order_id is null then
    insert into orders (customer_id) values (v_build.customer_id) returning id into v_order_id;
    update builds set order_id = v_order_id where id = p_build_id;
  end if;

  insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
  select v_order_id, p.id, p.name, p.sku, p_qty, coalesce(p_sale_price_pkr, p.price_pkr, 0)
  from products p where p.id = p_product_id
  returning id into v_item;
  if v_item is null then raise exception 'Product not found.' using errcode = 'check_violation'; end if;

  update orders set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order_id)
  where id = v_order_id;
  return v_item;
end $$;

-- Advance a one-off line's status (sourcing -> purchasing_done -> delivered). delivered_on stamps
-- on first delivery; the freeze trigger then locks the line's money.
create or replace function set_build_line_status(p_line_id uuid, p_status build_line_status)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to edit builds.' using errcode = 'check_violation';
  end if;
  update build_lines
  set status = p_status,
      delivered_on = case when p_status = 'delivered' then coalesce(delivered_on, current_date) else delivered_on end
  where id = p_line_id;
  if not found then raise exception 'Build line not found.' using errcode = 'check_violation'; end if;
end $$;

grant execute on function create_build(uuid, jsonb, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function add_build_catalogue_line(uuid, uuid, int, numeric) to authenticated;
grant execute on function set_build_line_status(uuid, build_line_status) to authenticated;
