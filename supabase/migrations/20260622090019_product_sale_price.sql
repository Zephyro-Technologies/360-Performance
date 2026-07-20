-- ===========================================================================
-- 360 Performance — sale price (Phase 8 completeness batch)
-- Optional discounted price; must be <= the regular price when both are set.
-- Public (the storefront strikes through the regular price). Catalogue sort stays
-- on price_pkr (regular) by default.
-- ===========================================================================
alter table products
  add column sale_price_pkr numeric(12,2) check (sale_price_pkr >= 0),
  add constraint products_sale_below_price
    check (sale_price_pkr is null or price_pkr is null or sale_price_pkr <= price_pkr);

create or replace view products_public as
select
  p.id,
  p.slug,
  p.name,
  p.brand,
  p.category_id,
  c.slug as category_slug,
  c.name as category_name,
  p.price_pkr,
  p.short_description,
  p.description,
  p.images,
  p.specs,
  p.availability,
  p.featured,
  p.created_at,
  coalesce(parent.slug, c.slug) as parent_slug,
  coalesce(parent.name, c.name) as parent_name,
  p.sku,
  p.mpn,
  p.barcode,
  p.meta_description,
  p.sale_price_pkr
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
where p.published and p.visibility = 'visible';
