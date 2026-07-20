-- ===========================================================================
-- 360 Performance — Invoices/Payments financial core (Phase 4)
-- Reversals become EXPLICIT positive rows (kind = 'reversal') instead of negative
-- amounts. Net paid = Sum(payments) - Sum(reversals) is computed IDENTICALLY by
-- the over-pay guard, invoice_balances, and analytics_daily. Atomic create_invoice
-- with settings-driven exclusive tax. invoice_items already snapshot name/sku/price.
-- ===========================================================================

-- 1) Explicit payment kind + positive-only amounts + reversal integrity.
create type payment_kind as enum ('payment', 'reversal');
alter table payments add column kind payment_kind not null default 'payment';
alter table payments drop constraint payments_amount_pkr_check;          -- was: amount_pkr <> 0
alter table payments add constraint payments_amount_pos check (amount_pkr > 0);
-- a reversal references exactly the payment it reverses; a payment never does.
alter table payments add constraint payments_reversal_ref
  check ((kind = 'reversal') = (reverses_payment_id is not null));

-- 2) RLS: payments stay insert-only; reversals are an ADMIN action.
drop policy payments_ins on payments;
create policy payments_ins on payments for insert to authenticated with check (
  (kind = 'payment'  and has_role(array['admin', 'staff']::user_role[]))
  or (kind = 'reversal' and has_role(array['admin']::user_role[]))
);

-- 3) Over-pay / over-reversal guard. net = Sum(payments) - Sum(reversals).
--    Uses > (exact-balance payment succeeds). Reversals can't exceed the
--    remaining reversible amount of the referenced payment.
create or replace function guard_payment_overpay() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv_total    numeric;
  v_voided     timestamptz;
  net_paid     numeric;
  ref_amount   numeric;
  ref_reversed numeric;
begin
  select total_pkr, voided_at into inv_total, v_voided from invoices where id = new.invoice_id;
  if v_voided is not null then
    raise exception 'This invoice is voided; no further payments or reversals.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(case when kind = 'payment' then amount_pkr else -amount_pkr end), 0)
    into net_paid from payments where invoice_id = new.invoice_id;

  if new.kind = 'payment' then
    if net_paid + new.amount_pkr > inv_total then
      raise exception 'Payment exceeds the remaining balance (balance %).', inv_total - net_paid
        using errcode = 'check_violation';
    end if;
  else -- reversal
    select amount_pkr into ref_amount from payments
      where id = new.reverses_payment_id and invoice_id = new.invoice_id and kind = 'payment';
    if ref_amount is null then
      raise exception 'The referenced payment was not found on this invoice.' using errcode = 'check_violation';
    end if;
    select coalesce(sum(amount_pkr), 0) into ref_reversed from payments
      where reverses_payment_id = new.reverses_payment_id and kind = 'reversal';
    if new.amount_pkr > ref_amount - ref_reversed then
      raise exception 'Reversal exceeds the remaining reversible amount of that payment.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- 4) invoice_balances — net paid + derived status (overdue = past due & balance>0).
create or replace view invoice_balances as
select
  i.id as invoice_id,
  i.total_pkr,
  b.paid_pkr,
  i.total_pkr - b.paid_pkr as balance_pkr,
  case
    when i.voided_at is not null then 'void'
    when i.total_pkr - b.paid_pkr <= 0 then 'paid'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    when b.paid_pkr > 0 then 'partial'
    else 'unpaid'
  end as status
from invoices i
cross join lateral (
  select coalesce(sum(case when p.kind = 'payment' then p.amount_pkr else -p.amount_pkr end), 0) as paid_pkr
  from payments p where p.invoice_id = i.id
) b;

-- 5) analytics_daily — revenue nets reversals on their paid_on day.
create or replace view analytics_daily as
with rev as (
  select paid_on as day,
         sum(case when kind = 'payment' then amount_pkr else -amount_pkr end) as revenue_pkr
  from payments group by paid_on
), exp as (
  select spent_on as day, sum(amount_pkr) as expense_pkr from expenses group by spent_on
)
select coalesce(rev.day, exp.day) as day,
       coalesce(rev.revenue_pkr, 0) as revenue_pkr,
       coalesce(exp.expense_pkr, 0) as expense_pkr
from rev
full outer join exp on rev.day = exp.day;

-- 6) Atomic invoice creation: optional inline customer, snapshot line items,
--    settings-driven EXCLUSIVE tax = round(subtotal * rate, 2). invoice_no from
--    the sequence trigger. SECURITY INVOKER -> RLS applies (staff/admin only).
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
  v_inv      invoices;
  v_item     jsonb;
  v_subtotal numeric;
  v_rate     numeric;
  v_inclusive boolean;
  v_tax      numeric;
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
    insert into invoice_items (invoice_id, product_id, name, sku, qty, price_pkr)
    select v_inv.id, p.id, p.name, p.sku, (v_item->>'qty')::int, coalesce(p.price_pkr, 0)
    from products p where p.id = (v_item->>'product_id')::uuid;
    if not found then
      raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation';
    end if;
  end loop;

  select coalesce(sum(qty * price_pkr), 0) into v_subtotal from invoice_items where invoice_id = v_inv.id;
  select tax_rate, tax_inclusive into v_rate, v_inclusive from settings where id = true;
  if coalesce(v_inclusive, false) then
    -- inclusive treatment changes the calc structure; not built until ruled on.
    raise exception 'Inclusive tax is not configured yet.' using errcode = 'check_violation';
  end if;
  v_tax := round(v_subtotal * coalesce(v_rate, 0), 2); -- exclusive, 2dp, numeric

  update invoices
  set subtotal_pkr = v_subtotal, tax_pkr = v_tax, total_pkr = v_subtotal + v_tax
  where id = v_inv.id
  returning * into v_inv;

  return v_inv;
end $$;

grant execute on function create_invoice(uuid, jsonb, uuid, jsonb, date) to authenticated;

-- Void an invoice server-side (voided_at = now()). RLS applies (staff/admin via
-- the invoices update policy); already-void / missing ids are a safe no-op.
create or replace function void_invoice(p_id uuid) returns invoices
language plpgsql security invoker set search_path = public as $$
declare v_inv invoices;
begin
  update invoices set voided_at = now() where id = p_id and voided_at is null returning * into v_inv;
  if not found then
    select * into v_inv from invoices where id = p_id;
  end if;
  return v_inv;
end $$;
grant execute on function void_invoice(uuid) to authenticated;
