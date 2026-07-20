-- ===========================================================================
-- 360 Performance — functions & triggers
-- ===========================================================================

-- updated_at maintenance
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger suppliers_set_updated_at  before update on suppliers  for each row execute function set_updated_at();
create trigger products_set_updated_at   before update on products   for each row execute function set_updated_at();
create trigger customers_set_updated_at  before update on customers  for each row execute function set_updated_at();
create trigger orders_set_updated_at     before update on orders     for each row execute function set_updated_at();
create trigger invoices_set_updated_at   before update on invoices   for each row execute function set_updated_at();
create trigger blog_posts_set_updated_at before update on blog_posts for each row execute function set_updated_at();

-- human-facing numbers from sequences (monotonic, never array length)
create or replace function assign_order_no() returns trigger
language plpgsql as $$
begin
  if new.order_no is null then
    new.order_no := 'ORD-' || nextval('order_no_seq');
  end if;
  return new;
end $$;
create trigger orders_assign_no before insert on orders for each row execute function assign_order_no();

create or replace function assign_invoice_no() returns trigger
language plpgsql as $$
begin
  if new.invoice_no is null then
    new.invoice_no := '360-INV-' || nextval('invoice_no_seq');
  end if;
  return new;
end $$;
create trigger invoices_assign_no before insert on invoices for each row execute function assign_invoice_no();

-- immutable-ledger over-payment guard: a positive payment may not push the
-- invoice over its total. Reversal rows (negative amount) are always allowed.
create or replace function guard_payment_overpay() returns trigger
language plpgsql as $$
declare
  inv_total numeric;
  paid      numeric;
begin
  select total_pkr into inv_total from invoices where id = new.invoice_id;
  select coalesce(sum(amount_pkr), 0) into paid from payments where invoice_id = new.invoice_id;
  if new.amount_pkr > 0 and (paid + new.amount_pkr) > inv_total then
    raise exception 'Payment % exceeds remaining balance (invoice total %, already paid %)',
      new.amount_pkr, inv_total, paid;
  end if;
  return new;
end $$;
create trigger payments_overpay_guard before insert on payments for each row execute function guard_payment_overpay();

-- RLS role helper: reads the caller's role from profiles. SECURITY DEFINER so
-- it is not blocked by RLS on profiles (and cannot recurse). Authorization is
-- ALWAYS server-side; the client `can()` is UX only.
create or replace function has_role(roles user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.active and p.role = any(roles)
  );
$$;
