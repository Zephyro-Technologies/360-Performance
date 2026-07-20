-- ===========================================================================
-- Phase 2 — RLS, grants, anon-hardening for the inventory/cost tables + views.
-- Cost data (RMB, landed cost, payables, weighted-average) must NEVER reach anon.
-- Mirrors the established pattern: authenticated granted privileges, has_role()
-- policies decide; stock_movements is an append-only ledger (insert-only, reversal
-- admin-only); batches are RPC-only (no write policy). anon explicitly revoked.
-- ===========================================================================

alter table purchase_orders      enable row level security;
alter table purchase_order_lines enable row level security;
alter table batches              enable row level security;
alter table stock_movements      enable row level security;

-- privileges (authenticated); anon gets nothing on these
grant select, insert, update, delete on purchase_orders, purchase_order_lines, batches, stock_movements to authenticated;
grant usage on sequence po_no_seq to authenticated;
grant select on batch_on_hand, product_inventory, product_cost, vendor_payables, purchase_order_lines_costed to authenticated;
grant execute on function receive_po_line(uuid, int, date) to authenticated;

-- purchase orders + lines: viewer reads, staff/admin write
create policy po_read   on purchase_orders      for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy po_write  on purchase_orders      for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy pol_read  on purchase_order_lines for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy pol_write on purchase_order_lines for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- batches: read-only to users; created only by receive_po_line() (security definer).
create policy batches_read on batches for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));

-- stock movements: append-only ledger. read for viewer+, insert for staff/admin,
-- reversals admin-only; NO update/delete policy (immutable for everyone).
create policy sm_read on stock_movements for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy sm_ins  on stock_movements for insert to authenticated with check (
      (kind <> 'reversal' and has_role(array['admin','staff']::user_role[]))
   or (kind  = 'reversal' and has_role(array['admin']::user_role[]))
);

-- anon hardening (default-privilege revoke covers new objects; explicit is belt-and-suspenders).
revoke all on purchase_orders, purchase_order_lines, batches, stock_movements from anon;
revoke all on batch_on_hand, product_inventory, product_cost, vendor_payables, purchase_order_lines_costed from anon;
