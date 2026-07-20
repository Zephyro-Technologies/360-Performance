-- ===========================================================================
-- 360 Performance — make availability an EXPLICIT editor choice (Track stock vs
-- Made to order), removing the derived-vs-override mental model. `made_to_order`
-- stops being a hidden override and becomes the explicit MODE. The "blank stock
-- silently means made-to-order" coupling is removed: a tracked product must carry a
-- quantity; made-to-order wins outright. The derived `availability` enum + the
-- products_public surface are UNCHANGED in behaviour — only how the editor expresses
-- the choice — so the storefront shows exactly what it shows today.
-- ===========================================================================

-- 1) New derivation: made-to-order wins; otherwise purely from the quantity. No
--    null-stock branch — null stock in track mode is treated as 0 (out of stock).
create or replace function derive_product_availability() returns trigger
language plpgsql as $$
begin
  if new.made_to_order then
    new.availability := 'made_to_order';
  elsif coalesce(new.stock_qty, 0) = 0 then
    new.availability := 'out_of_stock';
  elsif new.stock_qty <= new.low_stock_threshold then
    new.availability := 'low_stock';
  else
    new.availability := 'in_stock';
  end if;
  return new;
end $$;

-- 2) Map existing blank-stock products to the explicit made-to-order mode. They already
--    derived to 'made_to_order' (from null stock), so availability is unchanged — this
--    only makes the mode explicit. (No-op on a fresh reset: migrations run before
--    seed.sql, and the new default below covers seed rows.)
update products set made_to_order = true where not made_to_order and stock_qty is null;

-- 3) made_to_order is now the explicit mode; default to made-to-order (the common case,
--    and keeps seed.sql rows — which omit it — deriving to 'made_to_order' as before).
alter table products alter column made_to_order set default true;

-- 4) A tracked product must carry a quantity — no more null-stock-as-made-to-order.
alter table products add constraint products_stock_when_tracked
  check (made_to_order or stock_qty is not null);
