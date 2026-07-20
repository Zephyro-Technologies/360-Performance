-- ===========================================================================
-- 360 Performance — category hierarchy (Phase 4, schema-first)
-- Self-referential parent_id: null = top-level. Products attach to LEAF
-- categories only; parents are navigation containers (seeded in seed.sql).
-- ===========================================================================
alter table categories
  add column parent_id uuid references categories(id) on delete restrict;

create index categories_parent_idx on categories(parent_id);
