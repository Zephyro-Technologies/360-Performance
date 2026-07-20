-- ===========================================================================
-- One-off products — a reusable list of items NOT in the catalogue (imported per-order): name,
-- OEM #, vendor, landed cost, sale price. Shown in Catalogue → "One-off products" and addable to
-- orders. Inherits the build one-off shape; no stock/batch (house-only economics live on the order
-- line + its delivery ledger — see the order-integration migration).
-- ===========================================================================

create table oneoff_products (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  oem_part_no     text,
  supplier_id     uuid references suppliers(id) on delete set null,
  landed_cost_pkr numeric(12,2) not null default 0 check (landed_cost_pkr >= 0),
  sale_price_pkr  numeric(12,2) not null default 0 check (sale_price_pkr >= 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index oneoff_products_active_idx on oneoff_products(active);
create trigger oneoff_products_set_updated_at before update on oneoff_products for each row execute function set_updated_at();

alter table oneoff_products enable row level security;
grant select, insert, update, delete on oneoff_products to authenticated;
create policy oneoff_products_read  on oneoff_products for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy oneoff_products_write on oneoff_products for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
revoke all on oneoff_products from anon;
