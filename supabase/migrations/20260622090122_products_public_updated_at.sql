-- ===========================================================================
-- products_public — expose products.updated_at so the storefront sitemap can carry an ACCURATE
-- <lastmod> per product. It was falling back to created_at, which understates freshness after an
-- edit and gives crawlers a stale signal.
--
-- Reproduces the current definition (090032) verbatim and appends `updated_at` at the tail — a
-- view can only be extended by rebuilding it, and `create or replace view` requires every existing
-- column to be unchanged in name/type/order. product_inventory (a dependency) is untouched.
--
-- `updated_at` is a non-sensitive timestamp, not a B2 cost/margin column, so exposing it to anon
-- leaks nothing; `create or replace view` preserves the existing anon SELECT grant. No RLS-suite
-- change is needed (the suite guards the cost/margin columns, which are still absent here).
-- ===========================================================================
create or replace view products_public as
select
  p.id, p.slug, p.name, p.brand, p.category_id,
  c.slug as category_slug, c.name as category_name,
  p.price_pkr, p.short_description, p.description, p.images, p.specs,
  pi.availability, p.featured, p.created_at,
  coalesce(parent.slug, c.slug) as parent_slug,
  coalesce(parent.name, c.name) as parent_name,
  p.sku, p.mpn, p.meta_description, p.sale_price_pkr, pi.on_hand_qty as stock_qty,
  coalesce(p.sale_price_pkr, p.price_pkr) as effective_price_pkr,
  p.updated_at
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
join product_inventory pi on pi.product_id = p.id
where p.published and p.visibility = 'visible';
