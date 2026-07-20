-- ===========================================================================
-- 360 Performance — publish guard (Phase 5)
-- A product can only be PUBLISHED once it has a price. The ~92 unpriced products
-- stay unpublished (and off the storefront) until the client prices them.
-- ===========================================================================
alter table products
  add constraint products_priced_when_published
  check (not published or price_pkr is not null);

-- Blog: stamp published_at on the false->true transition; clear it when unpublished.
-- Keeps the publish date stable across later edits (not reset on every save).
create or replace function set_blog_published_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    new.published_at := now();
  elsif not new.published then
    new.published_at := null;
  end if;
  return new;
end $$;

create trigger blog_published_at before insert or update on blog_posts
  for each row execute function set_blog_published_at();
