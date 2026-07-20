-- ===========================================================================
-- 360 Performance — expose sku on products_public (Phase 8)
-- SKU / part numbers are PUBLIC-SAFE: customers reference them and search by them
-- (unlike cost/margin columns, which stay hidden). create-or-replace appends the
-- new column at the end of the view's column list.
-- ===========================================================================
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
  p.sku
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
where p.published and p.visibility = 'visible';
