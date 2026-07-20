-- ===========================================================================
-- 360 Performance — products_public + parent category (Phase 6)
-- Adds parent_slug / parent_name so the website can filter + navigate by PARENT
-- category (parents are leaves' containers; standalone leaves map to themselves).
-- create or replace keeps the existing anon grant.
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
  coalesce(parent.name, c.name) as parent_name
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
where p.published and p.visibility = 'visible';
