-- ===========================================================================
-- Quotations — a price estimate you send a customer BEFORE an invoice. Mirrors the
-- invoice shape (header + line snapshot + tier pricing + per-line sea/air + brand) but
-- is intentionally simpler: no payment ledger, no void/reversal, no tax (an estimate,
-- not a demand for money). total_pkr = subtotal_pkr. A quote can later be turned into an
-- invoice by re-keying its lines through create_invoice (no automatic link kept).
-- ===========================================================================

create sequence quote_no_seq start 1001;
create or replace function assign_quote_no() returns trigger
language plpgsql as $$
begin
  if new.quote_no is null then
    new.quote_no := '360-QUO-' || nextval('quote_no_seq');
  end if;
  return new;
end $$;

create table quotations (
  id           uuid primary key default gen_random_uuid(),
  quote_no     text unique,                               -- assigned by trigger
  customer_id  uuid not null references customers(id) on delete restrict,
  order_id     uuid references orders(id) on delete set null,
  subtotal_pkr numeric(12,2) not null default 0,
  total_pkr    numeric(12,2) not null default 0,
  notes        text,
  issue_date   date not null default current_date,
  valid_until  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index quotations_customer_idx on quotations(customer_id);
create index quotations_order_idx    on quotations(order_id);
create trigger quotations_assign_no  before insert on quotations for each row execute function assign_quote_no();
create trigger quotations_set_updated_at before update on quotations for each row execute function set_updated_at();

create table quotation_items (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references quotations(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  name          text not null,
  sku           text,
  brand         text,
  qty           int not null check (qty > 0),
  price_pkr     numeric(12,2) not null check (price_pkr >= 0),
  shipping_type text not null default 'sea' check (shipping_type in ('sea', 'air'))
);
create index quotation_items_quotation_idx on quotation_items(quotation_id);

-- ---- create_quotation: mirrors create_invoice (tier pricing, brand + shipping snapshot) minus tax ----
create or replace function create_quotation(
  p_customer_id uuid,
  p_new_customer jsonb,
  p_order_id uuid,
  p_items jsonb,
  p_notes text
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
      nullif(p_new_customer->>'email', ''),
      nullif(p_new_customer->>'phone', ''),
      nullif(p_new_customer->>'city', '')
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
  end loop;

  select coalesce(sum(qty * price_pkr), 0) into v_subtotal from quotation_items where quotation_id = v_quo.id;

  update quotations
  set subtotal_pkr = v_subtotal, total_pkr = v_subtotal
  where id = v_quo.id
  returning * into v_quo;

  return v_quo;
end $$;

-- ---- update_quotation: re-key the lines (a quote is freely editable — no payment/void gate) --------
create or replace function update_quotation(p_id uuid, p_items jsonb, p_notes text)
returns quotations
language plpgsql security invoker set search_path = public as $$
declare
  v_quo quotations;
  v_item jsonb;
  v_subtotal numeric;
begin
  select * into v_quo from quotations where id = p_id;
  if not found then
    raise exception 'Quotation not found.' using errcode = 'no_data_found';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A quotation needs at least one item.' using errcode = 'check_violation';
  end if;

  delete from quotation_items where quotation_id = p_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
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
  end loop;

  select coalesce(sum(qty * price_pkr), 0) into v_subtotal from quotation_items where quotation_id = p_id;

  update quotations
  set subtotal_pkr = v_subtotal, total_pkr = v_subtotal,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_id
  returning * into v_quo;

  return v_quo;
end $$;

-- ---- RLS + grants + anon-hardening (mirrors invoices: viewer reads, staff/admin write) ------------
alter table quotations enable row level security;
alter table quotation_items enable row level security;

grant select, insert, update, delete on quotations to authenticated;
grant select, insert, update, delete on quotation_items to authenticated;

create policy quotations_read  on quotations for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy quotations_write on quotations for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

create policy quotation_items_read  on quotation_items for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy quotation_items_write on quotation_items for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

revoke all on quotations from anon;
revoke all on quotation_items from anon;
