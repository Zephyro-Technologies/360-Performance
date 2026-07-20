-- ===========================================================================
-- 360 Performance — enforce leaf-only product categories (Phase 4)
-- Defense-in-depth beyond the UI picker: reject a product whose category_id
-- points to a category that has children (a parent/navigation container).
-- ===========================================================================
create or replace function products_require_leaf_category() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from categories where parent_id = new.category_id) then
    raise exception 'Category is a parent group; attach products to a leaf category instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger products_leaf_category
  before insert or update of category_id on products
  for each row execute function products_require_leaf_category();
