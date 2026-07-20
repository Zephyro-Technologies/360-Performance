-- ===========================================================================
-- 360 Performance — auto-generated product identifiers (SKU + slug).
--
-- The editor no longer asks for SKU/slug; the DB assigns both on INSERT.
--
-- SKU SCHEME (new products): {CODE}-{NNN}
--   CODE = short uppercase code from the (leaf) category name — initials for a
--          multi-word name (≤3), else its first 3 letters (e.g. Downpipes→DOW,
--          Brake Pads→BP, Intercooler + Heat Exchangers→IHE, Ambient Lighting→AL).
--   NNN  = zero-padded per-CODE sequence from an atomic counter (NOT array length;
--          same lesson as order/invoice numbering).
--   e.g. AL-001, AL-002, BP-001.
-- The 235 seeded products keep their legacy bare 4-digit Item#s (0400, 1300, …).
-- The two formats coexist by design: legacy SKUs are NOT globally unique (24 cross-
-- category collisions, e.g. 1300 in both ambient-lighting and android-carplay), which
-- is why uniqueness is category-scoped — `unique(category_id, sku)`. The prefix makes
-- new SKUs visually distinct from legacy AND globally unique among new products.
--
-- SLUG: slugified from the name, made unique by appending -2/-3/… on a real collision.
-- ===========================================================================

-- A blank-string default makes `sku` omittable on insert (the trigger fills it) and
-- lets the generated Insert type mark it optional. The trigger replaces '' with a SKU.
alter table products alter column sku set default '';

-- Atomic per-prefix counter (a row-locked upsert; never count(*)/array length).
create table sku_sequences (
  prefix    text primary key,
  last_seq  int not null default 0
);
alter table sku_sequences enable row level security;   -- default-deny; only the
revoke all on sku_sequences from anon;                 -- SECURITY DEFINER fns touch it

-- Short uppercase code from a category name (deterministic).
create or replace function category_sku_prefix(p_name text) returns text
language plpgsql immutable as $$
declare
  words text[];
  sig   text[] := '{}';
  w     text;
  code  text := '';
  i     int;
begin
  words := regexp_split_to_array(btrim(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]+', ' ', 'g'))), '\s+');
  foreach w in array words loop
    if length(w) > 0 and w not in ('AND', 'THE', 'WITH', 'FOR', 'OF') then
      sig := sig || w;
    end if;
  end loop;
  if coalesce(array_length(sig, 1), 0) >= 2 then
    for i in 1..least(array_length(sig, 1), 3) loop
      code := code || left(sig[i], 1);
    end loop;
  elsif coalesce(array_length(sig, 1), 0) = 1 then
    code := left(sig[1], 3);
  else
    code := 'GEN';
  end if;
  return code;
end $$;

-- Next SKU for a category: {PREFIX}-{NNN}. Atomic increment per prefix.
create or replace function next_product_sku(p_category_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_seq    int;
begin
  select category_sku_prefix(name) into v_prefix from categories where id = p_category_id;
  v_prefix := coalesce(nullif(v_prefix, ''), 'GEN');
  insert into sku_sequences (prefix, last_seq) values (v_prefix, 1)
    on conflict (prefix) do update set last_seq = sku_sequences.last_seq + 1
    returning last_seq into v_seq;
  return v_prefix || '-' || lpad(v_seq::text, 3, '0');
end $$;

-- URL-safe slug from the name, unique (append -2/-3/… on a real collision).
create or replace function unique_product_slug(p_name text, p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  base      text;
  candidate text;
  n         int := 1;
begin
  base := btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-');
  if base = '' then base := 'product'; end if;
  candidate := base;
  while exists (select 1 from products where slug = candidate and (p_id is null or id <> p_id)) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

-- Fill SKU + slug on insert when the client didn't supply them (it no longer does).
create or replace function products_autofill_identifiers() returns trigger
language plpgsql as $$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := next_product_sku(new.category_id);
  end if;
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := unique_product_slug(new.name, new.id);
  end if;
  return new;
end $$;

create trigger products_autofill_identifiers
  before insert on products
  for each row execute function products_autofill_identifiers();

-- Keep the generators off the public RPC surface (anon must not poke the counter).
revoke all on function category_sku_prefix(text) from public;
revoke all on function next_product_sku(uuid) from public;
revoke all on function unique_product_slug(text, uuid) from public;
grant execute on function category_sku_prefix(text) to authenticated, service_role;
grant execute on function next_product_sku(uuid) to authenticated, service_role;
grant execute on function unique_product_slug(text, uuid) to authenticated, service_role;
