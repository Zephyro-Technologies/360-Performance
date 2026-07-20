-- ===========================================================================
-- 360 Performance — drop Dimensions (length/width/height_cm) + Barcode from products
-- (client request, pre-launch, no real data). DESTRUCTIVE: the columns are removed.
-- `barcode` was exposed on products_public (public); dimensions were internal (B2).
-- Recreate products_public WITHOUT barcode (and re-grant), then drop the base columns.
-- MPN (manufacturer part #) is intentionally KEPT.
-- ===========================================================================

-- products_public selects p.barcode; `create or replace view` can't drop a view
-- column, so drop + recreate it without barcode before dropping the base column,
-- then restore the anon/authenticated SELECT grant.
drop view products_public;
create view products_public as
select
  p.id, p.slug, p.name, p.brand, p.category_id,
  c.slug as category_slug, c.name as category_name,
  p.price_pkr, p.short_description, p.description, p.images, p.specs,
  p.availability, p.featured, p.created_at,
  coalesce(parent.slug, c.slug) as parent_slug,
  coalesce(parent.name, c.name) as parent_name,
  p.sku, p.mpn, p.meta_description, p.sale_price_pkr, p.stock_qty
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
where p.published and p.visibility = 'visible';

grant select on products_public to anon, authenticated;

alter table products
  drop column length_cm,
  drop column width_cm,
  drop column height_cm,
  drop column barcode;
