-- ===========================================================================
-- Admin-only invoice editing + settings-driven bank details.
--
-- WHY THIS IS NARROW. Issued invoices are immutable by design here: corrections
-- go through a payment reversal or a void, so the money trail is append-only.
-- The client asked for an "edit" escape hatch, so it is gated to the one window
-- where editing cannot corrupt anything:
--
--   * ADMIN ONLY          — staff keep the void / reverse path.
--   * NOT VOIDED          — a void is final.
--   * NO PAYMENTS AT ALL  — the real hazard. guard_payment_overpay only fires when a
--     PAYMENT is inserted; it cannot see an invoice whose total is later edited DOWN.
--     Editing a paid invoice below its paid amount would leave it silently over-paid,
--     with a negative balance and a wrong status, and nothing would catch it. So an
--     invoice with any payment row (payment OR reversal) is frozen: reverse the payment
--     first — which leaves an audit trail — and only then edit.
--
-- Revenue in analytics_daily / pnl_summary is driven by PAYMENTS, not invoice totals,
-- so an unpaid invoice by definition contributes nothing yet — re-pricing its lines
-- cannot retroactively move a reported figure. That is what makes this window safe.
--
-- BANK DETAILS live on `settings` (the existing singleton, already admin-write /
-- staff-read via RLS, and never granted to anon). One account for the whole business:
-- changing it updates every invoice's payment block. They are presentation, not money,
-- so they are NOT snapshotted per invoice.
-- ===========================================================================

alter table settings
  add column if not exists bank_name     text,
  add column if not exists account_title text,
  add column if not exists iban          text;

comment on column settings.bank_name     is 'Bank shown in the invoice Payment Details block.';
comment on column settings.account_title is 'Account title shown in the invoice Payment Details block.';
comment on column settings.iban          is 'IBAN shown in the invoice Payment Details block.';

-- update_invoice — replace an unpaid invoice's line items and recompute its money.
-- SECURITY INVOKER: the caller's RLS still applies on invoices / invoice_items /
-- products on top of the explicit admin check below.
create or replace function update_invoice(p_id uuid, p_items jsonb)
returns invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_inv       invoices;
  v_item      jsonb;
  v_cust_type customer_type;
  v_payments  int;
  v_subtotal  numeric;
  v_rate      numeric;
  v_inclusive boolean;
  v_tax       numeric;
begin
  if not has_role(array['admin']::user_role[]) then
    raise exception 'Only an admin can edit an invoice.' using errcode = 'check_violation';
  end if;

  -- Row-lock the invoice, then re-check payments under that lock, so a payment being
  -- recorded concurrently cannot slip in between the check and the re-price.
  select * into v_inv from invoices where id = p_id for update;
  if v_inv.id is null then
    raise exception 'Invoice not found.' using errcode = 'check_violation';
  end if;
  if v_inv.voided_at is not null then
    raise exception 'A voided invoice cannot be edited.' using errcode = 'check_violation';
  end if;

  select count(*) into v_payments from payments where invoice_id = p_id;
  if v_payments > 0 then
    raise exception 'This invoice already has payments recorded. Reverse them before editing it.'
      using errcode = 'check_violation';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An invoice needs at least one item.' using errcode = 'check_violation';
  end if;

  select c.type into v_cust_type from customers c where c.id = v_inv.customer_id;

  delete from invoice_items where invoice_id = p_id;

  -- Same snapshot + tier-pricing rule as create_invoice: an explicit price_pkr wins,
  -- otherwise trade/workshop default to the reseller price and retail to the retail price.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    insert into invoice_items (invoice_id, product_id, name, sku, qty, price_pkr)
    select p_id, p.id, p.name, p.sku, (v_item->>'qty')::int,
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

  select coalesce(sum(qty * price_pkr), 0) into v_subtotal from invoice_items where invoice_id = p_id;
  select tax_rate, tax_inclusive into v_rate, v_inclusive from settings where id = true;
  if coalesce(v_inclusive, false) then
    raise exception 'Inclusive tax is not configured yet.' using errcode = 'check_violation';
  end if;
  v_tax := round(v_subtotal * coalesce(v_rate, 0), 2);  -- exclusive, 2dp — mirrors create_invoice

  update invoices
  set subtotal_pkr = v_subtotal, tax_pkr = v_tax, total_pkr = v_subtotal + v_tax
  where id = p_id
  returning * into v_inv;

  return v_inv;
end $$;

-- Convention (see 090053): every new internal RPC is revoked from anon + public and
-- granted only to authenticated. The rls-tests assert anon cannot execute internal RPCs.
revoke execute on function update_invoice(uuid, jsonb) from anon, public;
grant execute on function update_invoice(uuid, jsonb) to authenticated;
