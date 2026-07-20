-- ===========================================================================
-- SECURITY FIX: restore the admin-only guard and the row lock on update_invoice.
--
-- 090083 created update_invoice with three protections:
--   1. has_role(admin) — only an admin may edit an issued invoice
--   2. SELECT ... FOR UPDATE — row-lock the invoice, then re-check payments under that lock so
--      a payment being recorded concurrently cannot slip in between the check and the re-price
--   3. a payment guard whose message tells you how to proceed ("Reverse them before editing it")
--
-- 090084 (adding shipping_type) rewrote the function from the ORIGINAL pre-090083 body and
-- silently dropped ALL THREE. Every later redefinition — 090085 (brand), 090104 (product-less
-- lines), 090112 (discounts), 090113 (order sync) — was copied forward from that one, so the
-- omission has persisted ever since.
--
-- Impact: any STAFF user could edit an issued invoice by calling the RPC directly. The admin UI
-- hides the button, but update_invoice is SECURITY INVOKER and staff hold write RLS on
-- invoice_items, so nothing stopped them re-pricing an invoice. The RLS suite has a test for
-- exactly this ("staff cannot edit an invoice (admin-only)"); it did not catch the regression
-- because a broken fixture was making the whole suite skip.
--
-- This restores all three on top of the current body (per-line discounts + order sync).
-- ===========================================================================

create or replace function update_invoice(p_id uuid, p_items jsonb)
returns invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_inv invoices;
  v_item jsonb;
  v_payments int;
  v_subtotal numeric;
  v_discount numeric;
  v_rate numeric;
  v_inclusive boolean;
  v_tax numeric;
begin
  -- (1) admin-only. The UI merely hides the button; this is the actual guard.
  if not has_role(array['admin']::user_role[]) then
    raise exception 'Only an admin can edit an invoice.' using errcode = 'check_violation';
  end if;

  -- (2) row-lock, so a concurrent payment cannot land between the guard and the re-price.
  select * into v_inv from invoices where id = p_id for update;
  if v_inv.id is null then raise exception 'Invoice not found.' using errcode = 'no_data_found'; end if;
  if v_inv.voided_at is not null then
    raise exception 'This invoice is voided and cannot be edited.' using errcode = 'check_violation';
  end if;

  -- (3) payment guard, re-checked under the lock, with the actionable wording.
  select count(*) into v_payments from payments where invoice_id = p_id;
  if v_payments > 0 then
    raise exception 'This invoice already has payments recorded. Reverse them before editing it.'
      using errcode = 'check_violation';
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

  perform sync_order_from_invoice(p_id);

  return v_inv;
end $$;
