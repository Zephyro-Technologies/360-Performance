-- ===========================================================================
-- Fix: create_invoice never mirrored the line discount onto the order.
--
-- 090112 established the rule that an invoice discount MUST reach order_items, because
-- sale_margin (investor settlement + the whole P&L chain) computes revenue from
-- order_items.price_pkr, NOT from the invoice. It wired that into the two invoice->order
-- paths (link_invoice_order, autolink_invoice_order) and 090113 added it to update_invoice.
--
-- But those three paths never cover the PRIMARY flow. link_invoice_order raises, and
-- autolink_invoice_order early-returns, once invoices.order_id is not null — i.e. they only
-- fire when the order does not exist yet. The common case is the opposite: the order exists
-- and the operator invoices it (InvoiceFormDialog sends order_id AND discount_pct together).
-- That goes through create_invoice with a non-null p_order_id, which wrote the invoice and
-- returned without touching the order at all.
--
-- Effect before this fix: a 10% discount on a 174,000 line billed the customer 156,600 while
-- order_items.price_pkr stayed 174,000. On delivery sale_margin booked 174,000 of revenue and
-- snapshot_movement_economics froze an investor share on it — paying the investor their split
-- of 17,400 that was never collected. Exactly the failure 090112's own header describes.
--
-- Fix: call sync_order_from_invoice at the end of create_invoice, same as update_invoice does.
-- It is a no-op for a standalone invoice (returns immediately when invoices.order_id is null),
-- it never adds or removes order lines (an invoice may legitimately bill only part of an
-- order), and it skips lines with a realized sale movement (freeze_drawn_order_item, 090054).
-- Freshly-created invoice + existing order = nothing is delivered yet in the normal case, so
-- the mirror lands.
--
-- Body is otherwise the 090112 definition VERBATIM — the product-less-line branch (090104),
-- the 0..1 discount guard, the tier fallback, the freeze pass and the net-taxed totals are all
-- carried forward unchanged. Only the `perform` before `return` is new.
-- ===========================================================================

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

  -- Mirror price/discount onto the linked order so sale_margin books the DISCOUNTED revenue.
  -- No-op when this is a standalone invoice.
  perform sync_order_from_invoice(v_inv.id);

  return v_inv;
end $$;

grant execute on function create_invoice(uuid, jsonb, uuid, jsonb, date) to authenticated;
