-- ===========================================================================
-- Low-stock threshold: one global default + per-product overrides.
--
-- Before: products.low_stock_threshold was NOT NULL DEFAULT 3. Every row carried its own copy, so
-- there was no way to change the reorder point across the catalogue — the column default only
-- applies to NEW rows, and a row set to 3 was indistinguishable from a row that just took the
-- default.
--
-- After: settings.low_stock_threshold holds the house default, and products.low_stock_threshold
-- becomes NULLABLE where NULL means "follow the global". A number there is a deliberate override
-- for that one product.
--
-- Backfill note: rows currently sitting at the old default of 3 are set to NULL, i.e. they now
-- follow the global (which starts at 3, so nothing changes today, but raising the global will move
-- them). Rows with any other value were deliberately customised and keep their override.
-- ===========================================================================

alter table settings
  add column low_stock_threshold int not null default 3 check (low_stock_threshold >= 0);
comment on column settings.low_stock_threshold is
  'House default reorder point. Used for any product whose own low_stock_threshold is null.';

alter table products alter column low_stock_threshold drop not null;
comment on column products.low_stock_threshold is
  'Per-product override of the reorder point. NULL = follow settings.low_stock_threshold.';

update products set low_stock_threshold = null where low_stock_threshold = 3;

-- Availability now resolves the threshold as override → global. A scalar subquery (not a join)
-- keeps the existing GROUP BY intact and is evaluated once; `settings` is a single-row table.
-- Column list and types are unchanged, so products_public (which selects from this view) is
-- unaffected and needs no rebuild.
create or replace view product_inventory as
select p.id as product_id,
  coalesce(sum(boh.remaining), 0)::int                                  as on_hand_qty,
  coalesce(count(boh.batch_id) filter (where boh.remaining > 0), 0)::int as batch_count,
  case
    when p.made_to_order                              then 'made_to_order'::availability
    when coalesce(sum(boh.remaining), 0) <= 0         then 'out_of_stock'::availability
    when coalesce(sum(boh.remaining), 0) <= coalesce(
           p.low_stock_threshold,
           (select s.low_stock_threshold from settings s where s.id)
         )                                            then 'low_stock'::availability
    else 'in_stock'::availability
  end as availability
from products p
left join batch_on_hand boh on boh.product_id = p.id
group by p.id, p.made_to_order, p.low_stock_threshold;

-- The legacy stock_qty trigger still stamps products.availability (dead in practice — everything
-- reads product_inventory). Teach it the same fallback so a null override can't make it compare
-- against NULL and silently report 'in_stock'.
create or replace function derive_product_availability() returns trigger
language plpgsql as $$
declare v_threshold int;
begin
  select coalesce(new.low_stock_threshold, s.low_stock_threshold) into v_threshold
  from settings s where s.id;

  if new.made_to_order then
    new.availability := 'made_to_order';
  elsif coalesce(new.stock_qty, 0) = 0 then
    new.availability := 'out_of_stock';
  elsif new.stock_qty <= v_threshold then
    new.availability := 'low_stock';
  else
    new.availability := 'in_stock';
  end if;
  return new;
end $$;
