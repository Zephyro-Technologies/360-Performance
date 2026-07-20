-- ===========================================================================
-- 360 Performance — RLS, grants, storage (default-deny everywhere)
--
-- Model:
--  * authenticated role is broadly GRANTed table privileges; RLS policies +
--    has_role() decide what each role (admin/staff/viewer) may actually do.
--  * anon (website) is granted ONLY the public read surface (published content)
--    and can NEVER read the base products table — only products_public, which
--    omits cost/margin/supplier/weight columns (B2).
--  * service_role bypasses RLS (Edge Functions / FX job / privileged writes).
-- ===========================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Enable RLS on every table.
alter table currencies          enable row level security;
alter table categories          enable row level security;
alter table collections         enable row level security;
alter table product_collections enable row level security;
alter table suppliers           enable row level security;
alter table products            enable row level security;
alter table product_relations   enable row level security;
alter table customers           enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table order_stage_events  enable row level security;
alter table invoices            enable row level security;
alter table invoice_items       enable row level security;
alter table payments            enable row level security;
alter table expenses            enable row level security;
alter table blog_posts          enable row level security;
alter table testimonials        enable row level security;
alter table announcements       enable row level security;
alter table profiles            enable row level security;
alter table exchange_rates      enable row level security;
alter table audit_log           enable row level security;

-- ---------------------------------------------------------------------------
-- B2 column security: anon must never touch the base products table.
-- ---------------------------------------------------------------------------
revoke all on products from anon;
grant select on products_public to anon, authenticated;
grant select on analytics_daily, invoice_balances to authenticated;

-- ===========================================================================
-- PUBLIC READ SURFACE (anon) — published content only
-- ===========================================================================
grant select on categories, collections, product_collections, blog_posts, testimonials, announcements to anon;

create policy categories_anon_read   on categories          for select to anon using (true);
create policy collections_anon_read  on collections         for select to anon using (true);
create policy prodcoll_anon_read     on product_collections for select to anon using (true);
create policy blog_anon_read         on blog_posts          for select to anon using (published);
create policy testi_anon_read        on testimonials        for select to anon using (published);
create policy announce_anon_read     on announcements       for select to anon
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()));

-- ===========================================================================
-- AUTHENTICATED ROLE POLICIES (admin/staff/viewer via has_role)
-- ===========================================================================

-- Reusable role arrays are inlined per policy (no variables in plain SQL).

-- reference / taxonomy: viewer reads, staff+admin write, admin-only structural delete
create policy currencies_read  on currencies for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy currencies_write on currencies for all    to authenticated using (has_role(array['admin']::user_role[])) with check (has_role(array['admin']::user_role[]));

create policy categories_read  on categories for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy categories_write on categories for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

create policy collections_read  on collections for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy collections_write on collections for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

create policy prodcoll_read  on product_collections for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy prodcoll_write on product_collections for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- suppliers (internal): viewer read, staff+admin write+delete
create policy suppliers_read  on suppliers for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy suppliers_write on suppliers for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- products (base, internal columns): viewer read, staff+admin write+delete
create policy products_read  on products for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy products_ins   on products for insert to authenticated with check (has_role(array['admin','staff']::user_role[]));
create policy products_upd   on products for update to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy products_del   on products for delete to authenticated using (has_role(array['admin','staff']::user_role[]));

create policy prodrel_read  on product_relations for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy prodrel_write on product_relations for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- customers (internal): viewer read, staff+admin write+delete
create policy customers_read  on customers for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy customers_write on customers for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- orders: viewer read, staff+admin insert/update, ADMIN-ONLY delete (D4)
create policy orders_read on orders for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy orders_ins  on orders for insert to authenticated with check (has_role(array['admin','staff']::user_role[]));
create policy orders_upd  on orders for update to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy orders_del  on orders for delete to authenticated using (has_role(array['admin']::user_role[]));

create policy order_items_read  on order_items for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy order_items_write on order_items for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

create policy order_events_read  on order_stage_events for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy order_events_write on order_stage_events for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- invoices: viewer read, staff+admin insert/update, ADMIN-ONLY delete (prefer void)
create policy invoices_read on invoices for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy invoices_ins  on invoices for insert to authenticated with check (has_role(array['admin','staff']::user_role[]));
create policy invoices_upd  on invoices for update to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy invoices_del  on invoices for delete to authenticated using (has_role(array['admin']::user_role[]));

create policy invoice_items_read  on invoice_items for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy invoice_items_write on invoice_items for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- payments: IMMUTABLE LEDGER — viewer read, staff+admin INSERT only.
-- No UPDATE/DELETE policy for anyone (corrections = reversal rows). D4.
create policy payments_read on payments for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy payments_ins  on payments for insert to authenticated with check (has_role(array['admin','staff']::user_role[]));

-- expenses: viewer read, staff+admin write+delete
create policy expenses_read  on expenses for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy expenses_write on expenses for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- editorial: viewer read all, staff+admin write+delete (anon read handled above)
create policy blog_read  on blog_posts for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy blog_write on blog_posts for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

create policy testi_read  on testimonials for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy testi_write on testimonials for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

create policy announce_read  on announcements for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy announce_write on announcements for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- profiles: a user reads their own; admin manages all. No client deletes.
create policy profiles_self_read on profiles for select to authenticated using (id = auth.uid() or has_role(array['admin']::user_role[]));
create policy profiles_admin_ins on profiles for insert to authenticated with check (has_role(array['admin']::user_role[]));
create policy profiles_admin_upd on profiles for update to authenticated using (has_role(array['admin']::user_role[])) with check (has_role(array['admin']::user_role[]));

-- exchange_rates: authenticated read; writes via service_role only (FX job).
create policy fx_read on exchange_rates for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));

-- audit_log: staff+admin read; writes via triggers/service_role only.
create policy audit_read on audit_log for select to authenticated using (has_role(array['admin','staff']::user_role[]));

-- ===========================================================================
-- STORAGE — public-read buckets, staff/admin write (design now; upload UI P5)
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true),
       ('blog-images',    'blog-images',    true)
on conflict (id) do nothing;

create policy "bucket read"   on storage.objects for select to anon, authenticated
  using (bucket_id in ('product-images', 'blog-images'));
create policy "bucket insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images', 'blog-images') and has_role(array['admin','staff']::user_role[]));
create policy "bucket update" on storage.objects for update to authenticated
  using (bucket_id in ('product-images', 'blog-images') and has_role(array['admin','staff']::user_role[]));
create policy "bucket delete" on storage.objects for delete to authenticated
  using (bucket_id in ('product-images', 'blog-images') and has_role(array['admin','staff']::user_role[]));
