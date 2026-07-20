-- ===========================================================================
-- Partial payments + item over-payment credit.
--   * item_credit_added_pkr: extra paid on a line's ITEMS beyond their cost → banked as vendor
--     credit (shipping never adds credit).
--   * vendor_payables becomes AMOUNT-based: a line's item/ship is owed for (cost − amount paid),
--     so partial payments reduce what's owed (previously it was all-or-nothing on the paid date).
-- ===========================================================================
alter table purchase_order_lines add column item_credit_added_pkr numeric(14,2) not null default 0;

create or replace view vendor_payables as
select
  po.supplier_id,
  s.name,
  coalesce(sum(greatest(round(l.qty_ordered * l.unit_cost_pkr) - coalesce(l.item_paid_amount_pkr, 0), 0)), 0) as item_owed_pkr,
  coalesce(sum(greatest(round(l.qty_ordered * l.shipping_per_unit_pkr) - coalesce(l.ship_paid_amount_pkr, 0), 0)), 0) as ship_owed_pkr
from suppliers s
join purchase_orders po on po.supplier_id = s.id and po.status <> all (array['planning', 'approved', 'cancelled']::po_status[])
join purchase_order_lines_costed l on l.purchase_order_id = po.id
group by po.supplier_id, s.name;
