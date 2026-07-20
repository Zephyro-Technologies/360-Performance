-- ===========================================================================
-- Three hardening fixes surfaced by the admin audit.
-- ===========================================================================

-- (1) void_invoice stranded recognized revenue. It set voided_at with NO balance check, so voiding
-- a paid invoice left its payment rows intact — still counted as cash-in (analytics_daily,
-- useTopCustomer) — against a document marked void, with no offsetting reversal. Refuse to void
-- until the ledger is squared (reverse the payments first). Immutable-ledger rule: no silent
-- write-off. Net = payments − reversals; a fully-reversed invoice (net 0) still voids cleanly.
create or replace function void_invoice(p_id uuid) returns invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_inv invoices;
  v_net numeric;
begin
  select coalesce(sum(case when kind = 'reversal' then -amount_pkr else amount_pkr end), 0)
    into v_net from payments where invoice_id = p_id;
  if v_net > 0 then
    raise exception 'This invoice still has % PKR in payments — reverse them before voiding.', v_net
      using errcode = 'check_violation';
  end if;
  update invoices set voided_at = now() where id = p_id and voided_at is null returning * into v_inv;
  if not found then
    select * into v_inv from invoices where id = p_id;
  end if;
  return v_inv;
end $$;
grant execute on function void_invoice(uuid) to authenticated;

-- (2) autolink_invoice_order could create a DUPLICATE pipeline order under concurrent payments on the
-- same standalone (order_id-null) invoice: both inserts read order_id = null before either sets it,
-- so both insert an order. one_invoice_per_order (090067) constrains invoices-per-order, not the
-- reverse, so it wouldn't catch this — and a double order means the sale is fulfilled/counted twice.
-- Lock the invoice row (FOR UPDATE) so the second payment blocks until the first commits, then reads
-- the now-set order_id and early-outs. Body otherwise unchanged.
create or replace function autolink_invoice_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inv     invoices;
  v_net     numeric;
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
  select v_order_id, ii.product_id, ii.name, ii.sku, ii.qty, ii.price_pkr
  from invoice_items ii
  where ii.invoice_id = new.invoice_id;

  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order_id)
  where id = v_order_id;

  update invoices set order_id = v_order_id where id = new.invoice_id;
  return null;
end $$;

-- (3) Functions created AFTER the 090053 blanket revoke re-inherit Postgres's built-in PUBLIC=EXECUTE.
-- These two trigger functions aren't PostgREST-reachable (returns trigger), so not exploitable, but
-- the repo convention is "every new function revokes public execute" — close the gap. And drop the
-- orphan guard_supplier_payment, dead since 090075 dropped the supplier_payments table it guarded.
revoke execute on function autolink_invoice_order() from public;
revoke execute on function ensure_supplier_vendor_account() from public;
drop function if exists guard_supplier_payment();
