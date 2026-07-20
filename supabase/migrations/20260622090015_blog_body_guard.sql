-- ===========================================================================
-- 360 Performance — published blog posts must have a body (Phase 7 sweep)
-- Parity with the product publish guards (priced/slug): the body-required rule
-- was only enforced in the UI (blogSchema refine). A staff/admin calling PostgREST
-- directly could publish a body-less post the storefront would then serve. Make
-- the invariant hold for EVERY write path with a DB CHECK.
-- ===========================================================================
alter table blog_posts
  add constraint blog_body_when_published
  check (not published or (body_md is not null and length(btrim(body_md)) > 0));
