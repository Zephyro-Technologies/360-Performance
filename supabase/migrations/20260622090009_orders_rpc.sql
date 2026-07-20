-- ===========================================================================
-- 360 Performance — Orders: stage-event trigger + transactional create_order
-- (Phase 4). Snapshot columns + order_no sequence + FKs already exist (Phase 2);
-- this adds the integrity-preserving write paths.
-- ===========================================================================

-- Every stage change (incl. the initial 'received' on INSERT) writes an
-- order_stage_events row — the immutable history, regardless of the code path
-- that changed the stage (RPC, Kanban drag, direct update).
create or replace function log_order_stage_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
begin
  select name into v_actor from profiles where id = auth.uid();
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into order_stage_events (order_id, stage, actor) values (new.id, new.stage, v_actor);
  end if;
  return null;
end $$;

create trigger order_stage_event
  after insert or update of stage on orders
  for each row execute function log_order_stage_event();

-- Transactional order creation. Optionally creates an inline customer in the
-- SAME transaction (so cancelling never orphans a customer). Line items are
-- SNAPSHOT from products (name/sku/price_pkr) — never the FK alone. The total is
-- the server-computed PRE-TAX sum(qty*price_pkr); order_no comes from the
-- sequence trigger; the initial stage event from the trigger above.
-- SECURITY INVOKER → RLS applies (only staff/admin may insert).
create or replace function create_order(
  p_customer_id uuid,
  p_new_customer jsonb,
  p_items jsonb,
  p_notes text
) returns orders
language plpgsql security invoker set search_path = public as $$
declare
  v_customer_id uuid := p_customer_id;
  v_order orders;
  v_item jsonb;
begin
  if v_customer_id is null then
    if p_new_customer is null or coalesce(p_new_customer->>'name', '') = '' then
      raise exception 'A customer is required.' using errcode = 'check_violation';
    end if;
    insert into customers (name, type, email, phone, city)
    values (
      p_new_customer->>'name',
      -- validate before the enum cast so a bad value can't raise a raw 22P02
      case when p_new_customer->>'type' in ('retail', 'trade', 'workshop')
           then (p_new_customer->>'type')::customer_type else 'retail' end,
      nullif(p_new_customer->>'email', ''),
      nullif(p_new_customer->>'phone', ''),
      nullif(p_new_customer->>'city', '')
    )
    returning id into v_customer_id;
  end if;

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
    insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
    select v_order.id, p.id, p.name, p.sku, (v_item->>'qty')::int, coalesce(p.price_pkr, 0)
    from products p
    where p.id = (v_item->>'product_id')::uuid;
    if not found then
      raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation';
    end if;
  end loop;

  -- Server-authoritative pre-tax total (no shipping/tax — tax is invoice-level).
  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order.id)
  where id = v_order.id
  returning * into v_order;

  return v_order;
end $$;

grant execute on function create_order(uuid, jsonb, jsonb, text) to authenticated;
