-- Let a purchase order name the SEA/AIR (logistics) vendor handling its freight — at the PO
-- level (the default) and optionally per line (a product may ship by a different mode/vendor).
-- Purely additive attribution: nullable FKs to vendor_accounts. Shipping COST is unchanged —
-- it's still the per-unit PKR on the line, and record_po_payment still routes ship payments to
-- the supplier's account; this only records WHICH freight vendor each line/PO uses.
alter table purchase_orders
  add column freight_vendor_id uuid references vendor_accounts(id) on delete set null;

alter table purchase_order_lines
  add column freight_vendor_id uuid references vendor_accounts(id) on delete set null;

create index purchase_orders_freight_idx      on purchase_orders(freight_vendor_id);
create index purchase_order_lines_freight_idx on purchase_order_lines(freight_vendor_id);
