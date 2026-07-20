-- ===========================================================================
-- Unify product suppliers into the vendor-advance system.
--
-- Product suppliers become VENDOR ACCOUNTS (role null, supplier_id set), so they show up in
-- Vendor Advances with the same top-up / draw-down / reverse controls as the 3 logistics
-- vendors, sharing one immutable ledger. Purchasing "payments" to a supplier post a top-up here
-- (tagged with the order), so paying / overpaying in Purchasing is instantly visible as vendor
-- credit. Supersedes the standalone supplier_payments / supplier_balances (090074).
-- ===========================================================================

-- suppliers as vendor accounts (role is now optional; a supplier account is identified by supplier_id)
alter table vendor_accounts alter column role drop not null;
alter table vendor_accounts add column supplier_id uuid references suppliers(id) on delete cascade;
create unique index vendor_accounts_supplier_uniq on vendor_accounts(supplier_id) where supplier_id is not null;

insert into vendor_accounts (name, supplier_id)
select s.name, s.id from suppliers s
where s.active and not exists (select 1 from vendor_accounts va where va.supplier_id = s.id);

-- keep new suppliers in sync — one vendor account per supplier
create or replace function ensure_supplier_vendor_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into vendor_accounts (name, supplier_id) values (new.name, new.id) on conflict do nothing;
  return new;
end $$;
create trigger supplier_vendor_account after insert on suppliers for each row execute function ensure_supplier_vendor_account();

-- which purchase this advance movement was against (Purchasing "pay against an order")
alter table vendor_advance_entries add column purchase_order_id uuid references purchase_orders(id) on delete set null;

-- expose supplier_id on the balances view so the UI can label / route supplier accounts
create or replace view vendor_advance_balances as
  select va.id as vendor_account_id, va.name, va.role, va.active,
         coalesce(sum(case when e.kind = 'topup' then e.amount_pkr else -e.amount_pkr end), 0) as balance_pkr,
         va.supplier_id
  from vendor_accounts va
  left join vendor_advance_entries e on e.vendor_account_id = va.id
  group by va.id, va.name, va.role, va.active, va.supplier_id;

-- retire the standalone supplier ledger (090074) — superseded by the unified vendor-advance ledger
drop view if exists supplier_balances;
drop table if exists supplier_payments cascade;
