-- ===========================================================================
-- 360 Performance — inventory (Phase 8). Quantity-driven availability with a
-- manual made-to-order override, plus auto-decrement on delivery.
-- ===========================================================================
alter table products
  add column stock_qty           int     check (stock_qty >= 0),         -- null = not a stocked item
  add column low_stock_threshold int     not null default 3 check (low_stock_threshold >= 0),
  add column made_to_order       boolean not null default false;         -- manual override (factory-built)

-- availability is DERIVED from stock (the made_to_order override WINS). It stays a
-- stored column so products_public + the storefront read it unchanged; this trigger
-- keeps it from ever drifting from the quantity. Out-of-stock is just a value here —
-- it is NOT a visibility filter, so a published out-of-stock product still shows with
-- its badge (orthogonal to the unpriced-hides publish guard).
create or replace function derive_product_availability() returns trigger
language plpgsql as $$
begin
  if new.made_to_order or new.stock_qty is null then
    new.availability := 'made_to_order';
  elsif new.stock_qty = 0 then
    new.availability := 'out_of_stock';
  elsif new.stock_qty <= new.low_stock_threshold then
    new.availability := 'low_stock';
  else
    new.availability := 'in_stock';
  end if;
  return new;
end $$;

create trigger products_derive_availability
  before insert or update on products
  for each row execute function derive_product_availability();

-- Auto-decrement stock the FIRST time an order reaches 'delivered'. Per-order-once
-- via the stock_decremented latch (not per-transition), so re-saving or bouncing the
-- stage can't double-count. delivered-then-cancelled does NOT auto-restore (manual,
-- for launch). Skips snapshot lines whose product was deleted; clamps at 0.
alter table orders add column stock_decremented boolean not null default false;

create or replace function decrement_stock_on_delivery() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'delivered' and not old.stock_decremented then
    update products p
      set stock_qty = greatest(0, p.stock_qty - oi.qty)
      from order_items oi
      where oi.order_id = new.id and oi.product_id = p.id and p.stock_qty is not null;
    new.stock_decremented := true;
  end if;
  return new;
end $$;

create trigger orders_decrement_stock
  before update of stage on orders
  for each row execute function decrement_stock_on_delivery();

-- expose the count to the storefront (for "only N left")
create or replace view products_public as
select
  p.id, p.slug, p.name, p.brand, p.category_id,
  c.slug as category_slug, c.name as category_name,
  p.price_pkr, p.short_description, p.description, p.images, p.specs,
  p.availability, p.featured, p.created_at,
  coalesce(parent.slug, c.slug) as parent_slug,
  coalesce(parent.name, c.name) as parent_name,
  p.sku, p.mpn, p.barcode, p.meta_description, p.sale_price_pkr, p.stock_qty
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
where p.published and p.visibility = 'visible';
