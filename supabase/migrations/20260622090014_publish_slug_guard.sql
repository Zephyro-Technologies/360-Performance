-- ===========================================================================
-- 360 Performance — published products must have a slug (Phase 6 review)
-- The website links to /product/<slug>; a published row with a NULL slug would
-- produce /product/null. Mirror the priced-when-published guard for slug so the
-- public site never sees a slug-less product (products_public shows published only).
-- ===========================================================================
alter table products
  add constraint products_slug_when_published check (not published or slug is not null);
