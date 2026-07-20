-- ===========================================================================
-- The invoice becomes the single source of truth for a linked order's money.
--
-- Two problems this fixes:
--   1. An order NEVER followed its invoice. Editing an invoice left the order's lines and
--      total at their old figures forever (ORD-1118 sat at 19,600 against an invoice of
--      19,590 — a plain price edit, no discount involved). The order pipeline has been
--      quietly showing stale money.
--   2. Per-line discounts (090112) were invisible on the order side.
--
-- DESIGN — order_items.price_pkr stays the NET (post-discount) unit price.
-- That is deliberate: sale_margin, house_margin_daily, pnl_summary, investor_product_pnl and
-- product_sales_pnl all read order_items.price_pkr, and keeping it net means every one of them
-- keeps working untouched AND automatically recomputes when a sync changes the price. The new
-- columns are display/audit metadata that no financial view reads:
--   list_price_pkr — the gross unit price before discount (null when undiscounted)
--   discount_pct / discount_pkr — mirrored from the invoice line
--
-- CONSEQUENCE (chosen deliberately): syncing a DELIVERED line rewrites its price, so realized
-- margin and investor accruals for that line are recomputed. That is intended — a discount is
-- revenue that was never collected, so the margin should fall. update_invoice already refuses
-- once ANY payment exists, so this can only ever run before money has landed.
-- ===========================================================================

-- ---- 1. Columns ------------------------------------------------------------------------------
alter table order_items
  add column list_price_pkr numeric(12,2) check (list_price_pkr is null or list_price_pkr >= 0),
  add column discount_pct   numeric(5,4)  not null default 0 check (discount_pct >= 0 and discount_pct <= 1),
  add column discount_pkr   numeric(12,2) not null default 0 check (discount_pkr >= 0);

comment on column order_items.price_pkr is 'NET unit price (after any discount). Every P&L/margin view reads this.';
comment on column order_items.list_price_pkr is 'Gross unit price before the discount; null when the line is undiscounted. Display only.';
comment on column order_items.discount_pct is 'Mirrored from the invoice line. Display only — the discount is already baked into price_pkr.';

-- ---- 2. sync_order_from_invoice ---------------------------------------------------------------
-- Matches order lines to invoice lines on (product_id, or name for product-less one-offs),
-- de-duplicating repeats with row_number so two lines of the same product pair up predictably.
--
-- SCOPE: mirrors price/discount/qty on lines the two documents SHARE. It never adds or removes
-- order lines — see the note at (b) for the partial-invoice cases that makes that essential.
--
-- Updates IN PLACE rather than delete+reinsert: stock_movements.order_item_id and
-- corrections.order_item_id are ON DELETE SET NULL, so wiping the rows would silently orphan
-- realized sales and drop them out of sale_margin entirely. In-place keeps those links.
create or replace function sync_order_from_invoice(p_invoice_id uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_order_id uuid;
begin
  select order_id into v_order_id from invoices where id = p_invoice_id;
  if v_order_id is null then return; end if;   -- standalone invoice, nothing to mirror

  create temp table _pair on commit drop as
  with inv as (
    select ii.*,
           coalesce(ii.product_id::text, 'oneoff:' || ii.name) as k,
           row_number() over (partition by coalesce(ii.product_id::text, 'oneoff:' || ii.name)
                              order by ii.id) as rn
    from invoice_items ii where ii.invoice_id = p_invoice_id
  ), ord as (
    select oi.id, oi.qty_delivered,
           coalesce(oi.product_id::text, 'oneoff:' || oi.name) as k,
           row_number() over (partition by coalesce(oi.product_id::text, 'oneoff:' || oi.name)
                              order by oi.id) as rn
    from order_items oi where oi.order_id = v_order_id
  )
  select inv.id as inv_id, inv.product_id, inv.name, inv.sku, inv.qty,
         inv.price_pkr, inv.discount_pct, inv.discount_pkr,
         ord.id as ord_id, ord.qty_delivered
  from inv join ord on ord.k = inv.k and ord.rn = inv.rn;   -- shared lines only

  -- (a) matched, UNDELIVERED lines: mirror price + discount.
  --
  -- Delivered lines are skipped on purpose. freeze_drawn_order_item (090054) freezes the price
  -- of any line with a 'sale' stock movement — "record an at-fault correction instead of
  -- editing realized revenue" — because sale_margin joins order_items live, so repricing a
  -- shipped line retroactively rewrites booked revenue and the investor split. Syncing those
  -- would mean disabling a deliberate integrity guard, so we don't: they keep their realized
  -- price and surface in order_invoice_mismatch for a human to reconcile with a correction.
  --
  -- qty never drops below what already shipped (order_items_delivered_range).
  update order_items o
  set price_pkr      = round(p.price_pkr * (1 - p.discount_pct), 2),
      list_price_pkr = case when p.discount_pct > 0 then p.price_pkr else null end,
      discount_pct   = p.discount_pct,
      discount_pkr   = p.discount_pkr,
      qty            = greatest(p.qty, o.qty_delivered),
      name           = p.name,
      sku            = p.sku
  from _pair p
  where o.id = p.ord_id
    and not exists (select 1 from stock_movements sm
                    where sm.order_item_id = o.id and sm.kind = 'sale');

  -- (b) DELIBERATELY NOT DONE: adding/removing order lines to match the invoice.
  --
  -- An invoice legitimately bills only PART of an order — ORD-1112 has two lines and its
  -- invoice covers one of them; ORD-1105's invoice bills a product that isn't on the order at
  -- all. Mirroring line membership would have deleted a 156,000 undelivered line from ORD-1112
  -- and grafted an unrelated product onto ORD-1105.
  --
  -- So the sync mirrors MONEY on lines the two documents share, and never changes which lines
  -- an order has. An unmatched order line keeps its own price; an unmatched invoice line is
  -- simply not on the board. Line membership stays an explicit human decision (update_order).

  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order_id)
  where id = v_order_id;

  drop table _pair;
end $$;

revoke all on function sync_order_from_invoice(uuid) from public;
grant execute on function sync_order_from_invoice(uuid) to authenticated;

-- ---- 3. update_invoice mirrors onto the order ------------------------------------------------
-- Identical to 090112 except for the sync_order_from_invoice call before returning.
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

  -- Keep the order board in step with what the customer is actually being billed.
  perform sync_order_from_invoice(p_id);

  return v_inv;
end $$;

-- ---- 4. Both invoice->order creation paths carry the discount metadata too --------------------
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
  values (v_inv.customer_id, 'received', 'From invoice ' || coalesce(v_inv.invoice_no, ''))
  returning id into v_order_id;

  insert into order_items (order_id, product_id, name, sku, qty, price_pkr,
                           list_price_pkr, discount_pct, discount_pkr)
  select v_order_id, ii.product_id, ii.name, ii.sku, ii.qty,
         round(ii.price_pkr * (1 - ii.discount_pct), 2),
         case when ii.discount_pct > 0 then ii.price_pkr else null end,
         ii.discount_pct, ii.discount_pkr
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
  select * into v_inv from invoices where id = new.invoice_id for update;
  if v_inv.id is null then return null; end if;
  if v_inv.order_id is not null then return null; end if;
  if v_inv.voided_at is not null then return null; end if;

  select coalesce(sum(case when kind = 'reversal' then -amount_pkr else amount_pkr end), 0)
    into v_net from payments where invoice_id = new.invoice_id;
  if v_net <= 0 then return null; end if;

  insert into orders (customer_id, stage, notes)
  values (v_inv.customer_id, 'received',
          'Auto-created from paid invoice ' || coalesce(v_inv.invoice_no, ''))
  returning id into v_order_id;

  insert into order_items (order_id, product_id, name, sku, qty, price_pkr,
                           list_price_pkr, discount_pct, discount_pkr)
  select v_order_id, ii.product_id, ii.name, ii.sku, ii.qty,
         round(ii.price_pkr * (1 - ii.discount_pct), 2),
         case when ii.discount_pct > 0 then ii.price_pkr else null end,
         ii.discount_pct, ii.discount_pkr
  from invoice_items ii
  where ii.invoice_id = new.invoice_id;

  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order_id)
  where id = v_order_id;

  update invoices set order_id = v_order_id where id = new.invoice_id;
  return null;
end $$;

revoke execute on function autolink_invoice_order() from public;

-- ---- 5. Read-only report: orders whose total disagrees with their live invoice ----------------
-- Deliberately a VIEW, not a backfill. Existing mismatches predate the sync and rewriting them
-- in bulk would move historical margin/investor figures with no review. Inspect, then decide.
create view order_invoice_mismatch as
select o.id as order_id, o.order_no, o.stage,
       i.id as invoice_id, i.invoice_no,
       o.total_pkr as order_total_pkr,
       i.total_pkr as invoice_total_pkr,
       (o.total_pkr - i.total_pkr) as difference_pkr,
       exists (select 1 from order_items oi where oi.order_id = o.id and oi.qty_delivered > 0) as has_delivered_lines,
       exists (select 1 from payments p where p.invoice_id = i.id) as has_payments
from orders o
join invoices i on i.order_id = o.id and i.voided_at is null
where o.total_pkr is distinct from i.total_pkr;

grant select on order_invoice_mismatch to authenticated;
revoke all on order_invoice_mismatch from anon;
