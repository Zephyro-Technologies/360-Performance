-- ===========================================================================
-- Phase 7 — Custom Builds. A build is a PROJECT for a customer's vehicle (e.g. "Hurairah M3")
-- that owns part lines from TWO sources:
--   (A) CATALOGUE STOCK — consumed from existing batches like a normal sale. These are ordinary
--       order_items on the build's BACKING ORDER (builds.order_id); the UNCHANGED sale path
--       (fulfil_order_line -> draw_stock_fifo kind='sale') feeds COGS + the Phase 4 carve-out
--       verbatim. NOT stored here.
--   (B) ONE-OFF IMPORTED PARTS — imported for that specific car (OEM part#, vendor, landed cost)
--       that NEVER become catalogue products/batches. These live ONLY in build_lines below.
-- This file: the builds + build_lines entities (one-off lines only), numbering, the freeze-on-
-- delivery discipline, and RLS. The RPCs (090044), invoice branch (090045) and P&L (090046) follow.
-- ===========================================================================

create type build_status      as enum ('draft', 'sourcing', 'in_progress', 'completed', 'delivered', 'cancelled');
create type build_line_status as enum ('sourcing', 'purchasing_done', 'delivered');

create sequence build_no_seq start 1001;
create or replace function assign_build_no() returns trigger language plpgsql as $$
begin
  if new.build_no is null then new.build_no := 'BUILD-' || nextval('build_no_seq'); end if;
  return new;
end $$;

create table builds (
  id          uuid primary key default gen_random_uuid(),
  build_no    text unique,
  customer_id uuid not null references customers(id) on delete restrict,
  name        text not null,                                       -- project label, e.g. "Hurairah M3"
  vehicle     text,                                                -- optional fitment, e.g. "F80 M3"
  order_id    uuid unique references orders(id) on delete set null, -- the ONE backing order (catalogue lines); NULL for all-one-off
  status      build_status not null default 'draft',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index builds_customer_idx on builds(customer_id);
create trigger builds_assign_no     before insert on builds for each row execute function assign_build_no();
create trigger builds_set_updated_at before update on builds for each row execute function set_updated_at();

-- One-off imported parts ONLY (catalogue lines are order_items on the backing order).
-- landed_cost_pkr is the immutable one-off COGS source of truth (what 360 paid the vendor,
-- landed) — no batch, no movement, invisible to the catalogue/inventory.
create table build_lines (
  id              uuid primary key default gen_random_uuid(),
  build_id        uuid not null references builds(id) on delete cascade,
  name            text not null,
  oem_part_no     text,
  supplier_id     uuid references suppliers(id) on delete set null,  -- the vendor imported from
  qty             int not null check (qty > 0),
  landed_cost_pkr numeric(12,2) not null check (landed_cost_pkr >= 0),
  sale_price_pkr  numeric(12,2) not null check (sale_price_pkr >= 0),
  status          build_line_status not null default 'sourcing',
  delivered_on    date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index build_lines_build_idx on build_lines(build_id);
create trigger build_lines_set_updated_at before update on build_lines for each row execute function set_updated_at();

-- Freeze-on-delivery: once a one-off line is delivered its money is locked (mirrors the
-- immutability of batches.landed_cost_pkr) so a delivered line can't silently rewrite history
-- in pnl_summary / build_pnl. Metadata (notes) may still change.
create or replace function freeze_delivered_build_line() returns trigger language plpgsql as $$
begin
  if old.status = 'delivered' then
    if new.landed_cost_pkr <> old.landed_cost_pkr or new.sale_price_pkr <> old.sale_price_pkr or new.qty <> old.qty then
      raise exception 'A delivered build line is locked — cost, price and quantity cannot change.' using errcode = 'check_violation';
    end if;
    if new.status <> 'delivered' then
      raise exception 'A delivered build line cannot be un-delivered.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger build_lines_freeze before update on build_lines for each row execute function freeze_delivered_build_line();

-- ---- RLS + grants + anon-hardening ----------------------------------------
alter table builds      enable row level security;
alter table build_lines enable row level security;

grant select, insert, update, delete on builds, build_lines to authenticated;
grant usage on sequence build_no_seq to authenticated;

create policy builds_read       on builds      for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy builds_write      on builds      for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy build_lines_read  on build_lines for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy build_lines_write on build_lines for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

revoke all on builds, build_lines from anon;
