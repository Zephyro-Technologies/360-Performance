-- ===========================================================================
-- 360 Performance — additive catalogue fields (Phase 8 completeness batch)
-- Identifiers (mpn, barcode) + SEO (meta_description) are PUBLIC; shipping
-- dimensions (l/w/h) are INTERNAL. Brand stays freeform (editor adds autocomplete).
-- ===========================================================================
alter table products
  add column mpn              text,                                  -- manufacturer part number (public)
  add column barcode          text,                                  -- GTIN/UPC/EAN (public)
  add column meta_description text,                                  -- SEO (public; length capped in the editor)
  add column length_cm        numeric(8,2) check (length_cm >= 0),   -- shipping (internal)
  add column width_cm         numeric(8,2) check (width_cm  >= 0),
  add column height_cm        numeric(8,2) check (height_cm >= 0);

-- Append the public identifiers + meta to products_public (dimensions stay internal).
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
  p.meta_description
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
where p.published and p.visibility = 'visible';
