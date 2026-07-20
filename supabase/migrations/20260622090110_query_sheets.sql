-- ===========================================================================
-- Query sheets — rough working spreadsheets on Sales Documents. A "query" is scratch work: the
-- operator lays out prospective items in a grid shaped like the In-House catalogue table (cost
-- build-up → prices → margin) to price something up before it becomes a quotation or an invoice.
--
-- Deliberately NOT a financial document: nothing here posts to stock, orders, invoices, or the
-- P&L. Rows are free-form — a row may reference a real product (product_id) or be typed from
-- scratch. Because a sheet carries acquisition cost and margin, it is ADMIN-ONLY on both read and
-- write (unlike most internal tables, which staff/viewer may read).
--
-- Cell values live in a jsonb blob rather than 20-odd typed columns: the grid is scratch work whose
-- shape follows the catalogue's column list, and a column added there must not need a migration
-- here. Derived figures (landed cost, totals, margins) are NEVER stored — the client computes them
-- from the same formulas the catalogue table uses, so the two can't drift.
-- ===========================================================================

create table query_sheets (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Untitled query',
  notes      text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger query_sheets_set_updated_at before update on query_sheets for each row execute function set_updated_at();

create table query_sheet_rows (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references query_sheets(id) on delete cascade,
  position    int not null default 0,
  -- Optional link to a real catalogue product: set when the row was seeded from the catalogue.
  -- on delete set null — retiring a product must not blow a hole in someone's working sheet.
  product_id  uuid references products(id) on delete set null,
  cells       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index query_sheet_rows_sheet_idx on query_sheet_rows(sheet_id, position);
create trigger query_sheet_rows_set_updated_at before update on query_sheet_rows for each row execute function set_updated_at();

-- ---- RLS + grants + anon-hardening (admin-only; mirrors settings' admin write gate) ----
alter table query_sheets     enable row level security;
alter table query_sheet_rows enable row level security;

grant select, insert, update, delete on query_sheets     to authenticated;
grant select, insert, update, delete on query_sheet_rows to authenticated;

create policy query_sheets_read  on query_sheets for select to authenticated using (has_role(array['admin']::user_role[]));
create policy query_sheets_write on query_sheets for all    to authenticated using (has_role(array['admin']::user_role[])) with check (has_role(array['admin']::user_role[]));

create policy query_sheet_rows_read  on query_sheet_rows for select to authenticated using (has_role(array['admin']::user_role[]));
create policy query_sheet_rows_write on query_sheet_rows for all    to authenticated using (has_role(array['admin']::user_role[])) with check (has_role(array['admin']::user_role[]));

revoke all on query_sheets     from anon;
revoke all on query_sheet_rows from anon;
