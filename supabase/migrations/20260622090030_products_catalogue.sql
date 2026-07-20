-- ===========================================================================
-- Phase 2 — products becomes the CATALOGUE MASTER. Cost + stock + single-supplier
-- move to the PO/batch model: cost lives on immutable batches, stock = Σ batch
-- movements. We drop the cost/stock/supplier columns + the stored-availability
-- machinery + the whole-order decrement trigger, and add catalogue attributes
-- (status, internal reseller price, owner_kind). The 235 seeded products are dead
-- reference data (dropped on reseed) — no data migration needed.
-- ===========================================================================

-- Dependents that read the columns we're removing (products_public is rebuilt in
-- 090032 over the new product_inventory view).
drop view if exists products_public;
drop trigger if exists products_derive_availability on products;
drop function if exists derive_product_availability();
drop trigger if exists orders_decrement_stock on orders;
drop function if exists decrement_stock_on_delivery();
alter table products drop constraint if exists products_stock_when_tracked;

-- The whole-order decrement latch is gone with its trigger (Phase 3 rewires order
-- delivery -> per-line `sale` stock movements against batches).
alter table orders drop column if exists stock_decremented;

-- Cost / stock / single-supplier columns: superseded by purchase_order_lines + batches.
alter table products
  drop column cost_pkr,
  drop column cost_currency,
  drop column retail_price_sea_pkr,
  drop column total_end_cost_air_pkr,
  drop column total_end_cost_sea_pkr,
  drop column weight_kg,
  drop column supplier_id,        -- drops products_supplier_idx with it
  drop column stock_qty,
  drop column availability;       -- now derived in product_inventory (the `availability` enum type stays)

-- New catalogue attributes.
create type product_status as enum ('active','paused','discontinued');
create type owner_kind     as enum ('house','investor');

alter table products
  add column status             product_status not null default 'active',
  add column reseller_price_pkr numeric(12,2) check (reseller_price_pkr is null or reseller_price_pkr >= 0),
  add column owner_kind         owner_kind     not null default 'house';

-- reseller is a discount tier, like sale_price: never above retail.
alter table products add constraint products_reseller_below_price
  check (reseller_price_pkr is null or reseller_price_pkr <= price_pkr);

create index products_status_idx on products(status);
