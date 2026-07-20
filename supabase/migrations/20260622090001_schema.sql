-- ===========================================================================
-- 360 Performance — canonical schema (Phase 2)
-- Tables, enums, reference data, sequences, constraints.
-- Functions/triggers, views, and RLS live in later migrations.
-- ===========================================================================

create extension if not exists citext;

-- ---- enums ----------------------------------------------------------------
create type availability     as enum ('in_stock','low_stock','made_to_order','out_of_stock');
create type visibility       as enum ('visible','hidden','archived');
create type customer_type    as enum ('retail','trade','workshop');
create type order_stage      as enum ('received','processing','sourcing','ready_to_ship','shipped','delivered','cancelled');
create type payment_method   as enum ('bank_transfer','cash','card','easypaisa','other');
create type expense_category as enum ('inventory','shipping','marketing','operations','salaries');
create type user_role        as enum ('admin','staff','viewer');

-- ---- currencies (ISO 4217 reference; replaces an enum so new currencies are
--      INSERTs, not ALTER TYPE). Seeded D5: PKR/USD/CNY/EUR/AED/JPY/GBP. -------
create table currencies (
  code   char(3) primary key,
  name   text not null,
  symbol text
);
insert into currencies (code, name, symbol) values
  ('PKR','Pakistani Rupee','Rs'),
  ('USD','US Dollar','$'),
  ('CNY','Chinese Yuan (RMB)','¥'),
  ('EUR','Euro','€'),
  ('AED','UAE Dirham','د.إ'),
  ('JPY','Japanese Yen','¥'),
  ('GBP','Pound Sterling','£');

-- ---- taxonomy & merchandising ---------------------------------------------
create table categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  tagline    text,
  image_url  text,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

-- Curated homepage groupings, independent of the category taxonomy (e.g.
-- "Electronics", "Turbos & Manifolds"). NOT categories.
create table collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text,
  phone      text,
  country    text,
  currency   char(3) not null default 'PKR' references currencies(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- products -------------------------------------------------------------
-- INTERNAL columns (cost_*, retail_price_sea_pkr, total_end_cost_*, supplier_id,
-- visibility, cost_currency) must never reach anon — enforced via the
-- products_public view + base-table REVOKE in the RLS migration (B2).
create table products (
  id                      uuid primary key default gen_random_uuid(),
  sku                     text not null,                 -- real category-numbered Item#
  category_id             uuid not null references categories(id) on delete restrict,
  slug                    text unique,
  name                    text not null,
  brand                   text,
  short_description       text,
  description             text,
  specs                   jsonb not null default '[]'::jsonb,
  images                  text[] not null default '{}',
  compatibility           text,
  availability            availability not null default 'made_to_order',
  visibility              visibility   not null default 'visible',
  published               boolean not null default false,
  featured                boolean not null default false,
  -- pricing (public): price_pkr ← End Price (Air/Local) (B1)
  price_pkr               numeric(12,2) check (price_pkr >= 0),
  -- internal / margin columns (B2 — anon must never read these)
  cost_pkr                numeric(12,2) check (cost_pkr >= 0),
  cost_currency           char(3) not null default 'PKR' references currencies(code),
  retail_price_sea_pkr    numeric(12,2) check (retail_price_sea_pkr >= 0),
  total_end_cost_air_pkr  numeric(12,2),
  total_end_cost_sea_pkr  numeric(12,2),
  weight_kg               numeric(10,3),
  supplier_id             uuid references suppliers(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (category_id, sku)                              -- B3: sku is category-scoped
);
create index products_category_idx     on products(category_id);
create index products_published_idx    on products(published) where published;
create index products_supplier_idx     on products(supplier_id);

create table product_relations (
  product_id         uuid not null references products(id) on delete cascade,
  related_product_id uuid not null references products(id) on delete cascade,
  primary key (product_id, related_product_id),
  check (product_id <> related_product_id)
);

create table product_collections (
  product_id    uuid not null references products(id) on delete cascade,
  collection_id uuid not null references collections(id) on delete cascade,
  primary key (product_id, collection_id)
);

-- ---- customers ------------------------------------------------------------
create table customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       citext unique,
  phone       text,
  city        text,
  type        customer_type not null default 'retail',
  address     text,
  province    text,
  postal_code text,
  since       date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- orders ---------------------------------------------------------------
create table orders (
  id          uuid primary key default gen_random_uuid(),
  order_no    text unique,                               -- assigned by trigger from sequence
  customer_id uuid not null references customers(id) on delete restrict,
  stage       order_stage not null default 'received',
  total_pkr   numeric(12,2) not null default 0,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index orders_customer_idx on orders(customer_id);
create index orders_stage_idx    on orders(stage);

create table order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name       text not null,                              -- snapshot
  sku        text,                                       -- snapshot
  qty        int not null check (qty > 0),
  price_pkr  numeric(12,2) not null check (price_pkr >= 0)
);
create index order_items_order_idx on order_items(order_id);

create table order_stage_events (
  id       uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  stage    order_stage not null,
  at       timestamptz not null default now(),
  actor    text
);
create index order_stage_events_order_idx on order_stage_events(order_id);

-- ---- invoices -------------------------------------------------------------
create table invoices (
  id          uuid primary key default gen_random_uuid(),
  invoice_no  text unique,                               -- assigned by trigger
  customer_id uuid not null references customers(id) on delete restrict,
  order_id    uuid references orders(id) on delete set null,
  subtotal_pkr numeric(12,2) not null default 0,
  tax_pkr      numeric(12,2) not null default 0,
  total_pkr    numeric(12,2) not null default 0,
  issue_date   date not null default current_date,
  due_date     date,
  voided_at    timestamptz,                              -- prefer void over delete (D4)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index invoices_customer_idx on invoices(customer_id);
create index invoices_order_idx    on invoices(order_id);

create table invoice_items (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name       text not null,
  sku        text,
  qty        int not null check (qty > 0),
  price_pkr  numeric(12,2) not null check (price_pkr >= 0)
);
create index invoice_items_invoice_idx on invoice_items(invoice_id);

-- Immutable ledger (D4): no UPDATE/DELETE (enforced in RLS); corrections are
-- reversal rows (negative amount referencing the original). FK is RESTRICT so a
-- cascade can never bypass RLS to delete ledger rows.
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references invoices(id) on delete restrict,
  amount_pkr          numeric(12,2) not null check (amount_pkr <> 0),
  method              payment_method not null,
  paid_on             date not null default current_date,
  reverses_payment_id uuid references payments(id),
  created_at          timestamptz not null default now()
);
create index payments_invoice_idx on payments(invoice_id);

create table expenses (
  id          uuid primary key default gen_random_uuid(),
  category    expense_category not null,
  supplier_id uuid references suppliers(id) on delete set null,
  order_id    uuid references orders(id) on delete set null,
  amount_pkr  numeric(12,2) not null check (amount_pkr >= 0),
  spent_on    date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---- editorial / content --------------------------------------------------
create table blog_posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  excerpt      text,
  body_md      text,                                     -- D6: Markdown only
  author       text,
  read_minutes int,
  hero_image   text,
  published    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table testimonials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  location   text,
  rating     int check (rating between 1 and 5),
  quote      text,
  video_url  text,                                       -- D: nullable video reel
  published  boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table announcements (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  active     boolean not null default false,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---- identity / system ----------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  email      citext,
  role       user_role not null default 'viewer',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table exchange_rates (
  currency   char(3) primary key references currencies(code),
  rate_pkr   numeric(14,6) not null,
  as_of      timestamptz,
  fetched_at timestamptz not null default now()
);

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_name  text,
  action      text not null,
  entity_type text,
  entity_id   text,
  detail      text,
  at          timestamptz not null default now()
);

-- ---- human-facing number sequences (never array length) -------------------
create sequence order_no_seq   start 1001;
create sequence invoice_no_seq start 1001;
