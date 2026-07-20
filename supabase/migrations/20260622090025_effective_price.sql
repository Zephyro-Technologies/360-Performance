-- ===========================================================================
-- 360 Performance — expose effective_price_pkr (= coalesce(sale, regular)) on
-- products_public so the storefront SORTS + range-FILTERS by the price customers
-- actually see. The card shows the sale price, but sort/range-filter previously ran
-- on the regular price_pkr, so a discounted item could sort out of order or be
-- excluded by a maxPrice filter despite a visible sale price under the cap.
-- create-or-replace APPENDS the column at the end (same leading columns/order), so
-- the existing anon/authenticated grant is preserved.
-- ===========================================================================
create or replace view products_public as
select
  p.id, p.slug, p.name, p.brand, p.category_id,
  c.slug as category_slug, c.name as category_name,
  p.price_pkr, p.short_description, p.description, p.images, p.specs,
  p.availability, p.featured, p.created_at,
  coalesce(parent.slug, c.slug) as parent_slug,
  coalesce(parent.name, c.name) as parent_name,
  p.sku, p.mpn, p.meta_description, p.sale_price_pkr, p.stock_qty,
  coalesce(p.sale_price_pkr, p.price_pkr) as effective_price_pkr
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
where p.published and p.visibility = 'visible';
