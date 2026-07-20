-- ===========================================================================
-- Per-line percentage discounts on INVOICES.
--
-- Shape: each invoice line carries a discount_pct (0..1). The resolved rupee figure is stored
-- alongside it (discount_pkr) so an issued invoice's total can never drift if a product's
-- catalogue price later changes — same reasoning as the existing name/sku/price snapshots.
--
--   line gross = qty * price_pkr
--   line net   = qty * price_pkr - discount_pkr        where discount_pkr = round(gross * pct, 2)
--   invoices.subtotal_pkr = sum(gross)                  <- unchanged meaning, still gross
--   invoices.discount_pkr = sum(line discount_pkr)      <- new
--   invoices.total_pkr    = subtotal - discount + tax   <- tax now applies to the NET
--
-- Tax is currently rate 0 / exclusive, so taxing the net is a no-op today; it is written this
-- way because taxing a discount you never charged would be wrong the day the rate moves off 0.
--
-- QUOTATIONS AND ORDERS ARE NOT GIVEN A DISCOUNT FIELD (deliberate, per the client's call) —
-- but the discount MUST still reach order_items, because sale_margin (investor settlement and
-- the whole P&L chain) computes revenue from order_items.price_pkr, NOT from the invoice. An
-- invoice-only discount would book full-price revenue and pay investors their split on money
-- that was never collected. So the two invoice->order paths (link_invoice_order and the
-- autolink-on-first-payment trigger) copy a DISCOUNTED UNIT PRICE into order_items.
--
-- Per-unit rather than a lump sum per line, because stock_movements realize revenue per
-- delivered unit (sale_margin multiplies sm.qty * oi.price_pkr) — a partially shipped line
-- has to carry the discount proportionally.
-- ===========================================================================

-- ---- 1. Columns -----------------------------------------------------------------------------
alter table invoice_items
  add column discount_pct numeric(5,4)  not null default 0 check (discount_pct >= 0 and discount_pct <= 1),
  add column discount_pkr numeric(12,2) not null default 0 check (discount_pkr >= 0);

alter table invoices
  add column discount_pkr numeric(12,2) not null default 0 check (discount_pkr >= 0);

comment on column invoice_items.discount_pct is 'Per-line discount as a fraction (0.10 = 10% off). Operator-entered.';
comment on column invoice_items.discount_pkr is 'Resolved rupee discount for this line, frozen at write time: round(qty * price_pkr * discount_pct, 2).';
comment on column invoices.discount_pkr is 'Sum of the line discounts. total_pkr = subtotal_pkr - discount_pkr + tax_pkr.';

-- ---- 2. create_invoice / update_invoice -----------------------------------------------------
-- Both keep the product-less-line branch restored in 090104. The only change is reading
-- discount_pct off each item, resolving it to rupees in one pass after the lines land (the
-- product-backed branch takes its price from `products`, so the rupee figure isn't known until
-- the row exists), and folding it into the header totals.

create or replace function create_invoice(
  p_customer_id uuid, p_new_customer jsonb, p_order_id uuid, p_items jsonb, p_due_date date
) returns invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_customer_id uuid := p_customer_id;
  v_cust_type   customer_type;
  v_inv         invoices;
  v_item        jsonb;
  v_subtotal    numeric;
  v_discount    numeric;
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
      nullif(p_new_customer->>'email', ''), nullif(p_new_customer->>'phone', ''), nullif(p_new_customer->>'city', '')
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
    if coalesce((v_item->>'discount_pct')::numeric, 0) < 0
       or coalesce((v_item->>'discount_pct')::numeric, 0) > 1 then
      raise exception 'A line discount must be between 0%% and 100%%.' using errcode = 'check_violation';
    end if;
    if coalesce(v_item->>'product_id', '') = '' then
      -- Product-less line (e.g. a one-off): name + price straight from the payload.
      if coalesce(v_item->>'name', '') = '' then
        raise exception 'A line without a product needs a name.' using errcode = 'check_violation';
      end if;
      insert into invoice_items (invoice_id, product_id, name, sku, brand, qty, price_pkr, shipping_type, discount_pct)
      values (v_inv.id, null, v_item->>'name', nullif(v_item->>'sku', ''), nullif(v_item->>'brand', ''),
              (v_item->>'qty')::int, coalesce((v_item->>'price_pkr')::numeric, 0),
              coalesce(nullif(v_item->>'shipping_type', ''), 'sea'),
              coalesce((v_item->>'discount_pct')::numeric, 0));
    else
      insert into invoice_items (invoice_id, product_id, name, sku, brand, qty, price_pkr, shipping_type, discount_pct)
      select v_inv.id, p.id, p.name, p.sku, p.brand, (v_item->>'qty')::int,
        coalesce(
          (v_item->>'price_pkr')::numeric,
          case when v_cust_type in ('trade', 'workshop') then coalesce(p.reseller_price_pkr, p.price_pkr, 0)
               else coalesce(p.price_pkr, 0) end
        ),
        coalesce(nullif(v_item->>'shipping_type', ''), 'sea'),
        coalesce((v_item->>'discount_pct')::numeric, 0)
      from products p
      where p.id = (v_item->>'product_id')::uuid;
      if not found then
        raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  -- Freeze each line's rupee discount now that the effective price is known.
  update invoice_items
  set discount_pkr = round(qty * price_pkr * discount_pct, 2)
  where invoice_id = v_inv.id;

  select coalesce(sum(qty * price_pkr), 0), coalesce(sum(discount_pkr), 0)
    into v_subtotal, v_discount
  from invoice_items where invoice_id = v_inv.id;

  select tax_rate, tax_inclusive into v_rate, v_inclusive from settings where id = true;
  if coalesce(v_inclusive, false) then
    raise exception 'Inclusive tax is not configured yet.' using errcode = 'check_violation';
  end if;
  v_tax := round((v_subtotal - v_discount) * coalesce(v_rate, 0), 2);

  update invoices
  set subtotal_pkr = v_subtotal, discount_pkr = v_discount, tax_pkr = v_tax,
      total_pkr = v_subtotal - v_discount + v_tax
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
  v_discount numeric;
  v_rate numeric;
  v_inclusive boolean;
  v_tax numeric;
begin
  select * into v_inv from invoices where id = p_id;
  if not found then raise exception 'Invoice not found.' using errcode = 'no_data_found'; end if;
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
    if coalesce((v_item->>'discount_pct')::numeric, 0) < 0
       or coalesce((v_item->>'discount_pct')::numeric, 0) > 1 then
      raise exception 'A line discount must be between 0%% and 100%%.' using errcode = 'check_violation';
    end if;
    if coalesce(v_item->>'product_id', '') = '' then
      if coalesce(v_item->>'name', '') = '' then
        raise exception 'A line without a product needs a name.' using errcode = 'check_violation';
      end if;
      insert into invoice_items (invoice_id, product_id, name, sku, brand, qty, price_pkr, shipping_type, discount_pct)
      values (p_id, null, v_item->>'name', nullif(v_item->>'sku', ''), nullif(v_item->>'brand', ''),
              (v_item->>'qty')::int, coalesce((v_item->>'price_pkr')::numeric, 0),
              coalesce(nullif(v_item->>'shipping_type', ''), 'sea'),
              coalesce((v_item->>'discount_pct')::numeric, 0));
    else
      insert into invoice_items (invoice_id, product_id, name, sku, brand, qty, price_pkr, shipping_type, discount_pct)
      select p_id, p.id, p.name, p.sku, p.brand, (v_item->>'qty')::int,
        coalesce(
          (v_item->>'price_pkr')::numeric,
          case when exists (select 1 from customers c where c.id = v_inv.customer_id and c.type in ('trade', 'workshop'))
               then coalesce(p.reseller_price_pkr, p.price_pkr, 0)
               else coalesce(p.price_pkr, 0) end
        ),
        coalesce(nullif(v_item->>'shipping_type', ''), 'sea'),
        coalesce((v_item->>'discount_pct')::numeric, 0)
      from products p where p.id = (v_item->>'product_id')::uuid;
      if not found then
        raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  update invoice_items
  set discount_pkr = round(qty * price_pkr * discount_pct, 2)
  where invoice_id = p_id;

  select coalesce(sum(qty * price_pkr), 0), coalesce(sum(discount_pkr), 0)
    into v_subtotal, v_discount
  from invoice_items where invoice_id = p_id;

  select tax_rate, tax_inclusive into v_rate, v_inclusive from settings where id = true;
  if coalesce(v_inclusive, false) then
    raise exception 'Inclusive tax is not configured yet.' using errcode = 'check_violation';
  end if;
  v_tax := round((v_subtotal - v_discount) * coalesce(v_rate, 0), 2);

  update invoices
  set subtotal_pkr = v_subtotal, discount_pkr = v_discount, tax_pkr = v_tax,
      total_pkr = v_subtotal - v_discount + v_tax
  where id = p_id
  returning * into v_inv;

  return v_inv;
end $$;

-- ---- 3. category_sales: bill line revenue NET of the discount --------------------------------
-- Otherwise "What's selling" would report revenue that was never invoiced.
drop view if exists category_sales;
create view category_sales as
select
  ii.id          as item_id,
  inv.id         as invoice_id,
  inv.issue_date,
  leaf.id        as category_id,
  coalesce(leaf.name, 'Uncategorized')               as category_name,
  coalesce(parent.id, leaf.id)                        as rollup_id,
  coalesce(parent.name, leaf.name, 'Uncategorized')  as rollup_name,
  (ii.qty * ii.price_pkr - ii.discount_pkr)           as revenue_pkr
from invoice_items ii
join invoices inv      on inv.id = ii.invoice_id and inv.voided_at is null
left join products p   on p.id = ii.product_id
left join categories leaf   on leaf.id = p.category_id
left join categories parent on parent.id = leaf.parent_id;

grant select on category_sales to authenticated;
revoke all on category_sales from anon;

-- ---- 4. Carry the discount into order_items on both invoice->order paths ---------------------
-- Net unit price, rounded to the rupee-cent the column stores. sale_margin then computes
-- margin and the investor split off the money actually charged.

create or replace function link_invoice_order(p_invoice_id uuid)
returns orders
language plpgsql security invoker set search_path = public as $$
declare
  v_inv      invoices;
  v_order_id uuid;
  v_order    orders;
begin
  select * into v_inv from invoices where id = p_invoice_id;
  if not found then raise exception 'Invoice not found.' using errcode = 'no_data_found'; end if;
  if v_inv.voided_at is not null then
    raise exception 'This invoice is voided.' using errcode = 'check_violation';
  end if;
  if v_inv.order_id is not null then
    raise exception 'This invoice is already on the order board.' using errcode = 'check_violation';
  end if;

  insert into orders (customer_id, stage, notes)
  values (v_inv.customer_id, 'received',
          'From invoice ' || coalesce(v_inv.invoice_no, ''))
  returning id into v_order_id;

  insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
  select v_order_id, ii.product_id, ii.name, ii.sku, ii.qty,
         round(ii.price_pkr * (1 - ii.discount_pct), 2)
  from invoice_items ii
  where ii.invoice_id = p_invoice_id;

  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order_id)
  where id = v_order_id
  returning * into v_order;

  update invoices set order_id = v_order_id where id = p_invoice_id;
  return v_order;
end $$;

revoke all on function link_invoice_order(uuid) from public;
grant execute on function link_invoice_order(uuid) to authenticated;

create or replace function autolink_invoice_order()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inv      invoices;
  v_net      numeric;
  v_order_id uuid;
begin
  select * into v_inv from invoices where id = new.invoice_id for update;   -- serialize concurrent payments
  if v_inv.id is null then return null; end if;
  if v_inv.order_id is not null then return null; end if;   -- already on the board
  if v_inv.voided_at is not null then return null; end if;  -- void invoice, ignore

  select coalesce(sum(case when kind = 'reversal' then -amount_pkr else amount_pkr end), 0)
    into v_net from payments where invoice_id = new.invoice_id;
  if v_net <= 0 then return null; end if;

  insert into orders (customer_id, stage, notes)
  values (v_inv.customer_id, 'received',
          'Auto-created from paid invoice ' || coalesce(v_inv.invoice_no, ''))
  returning id into v_order_id;

  insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
  select v_order_id, ii.product_id, ii.name, ii.sku, ii.qty,
         round(ii.price_pkr * (1 - ii.discount_pct), 2)
  from invoice_items ii
  where ii.invoice_id = new.invoice_id;

  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order_id)
  where id = v_order_id;

  update invoices set order_id = v_order_id where id = new.invoice_id;
  return null;
end $$;

revoke execute on function autolink_invoice_order() from public;
