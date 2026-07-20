-- ===========================================================================
-- Fix a rounding-basis mismatch introduced in 090077. That version summed
-- round(qty * unit_cost_pkr) where unit_cost_pkr is already rounded per-unit to 2dp, while the
-- client (usePODues / the PO-detail amount editor) computes round(qty * unit_cost_rmb * rate) at
-- full precision. The two could disagree by up to qty × 0.005 PKR, so a fully-paid PO could show a
-- sub-rupee "Partial". Recompute from the RAW line cost so the view and the client agree exactly.
-- ===========================================================================
create or replace view vendor_payables as
select
  po.supplier_id,
  s.name,
  coalesce(sum(greatest(round(l.qty_ordered * l.unit_cost_rmb * coalesce(po.frozen_rate_rmb_pkr, 0)) - coalesce(l.item_paid_amount_pkr, 0), 0)), 0) as item_owed_pkr,
  coalesce(sum(greatest(round(l.qty_ordered * l.shipping_per_unit_pkr) - coalesce(l.ship_paid_amount_pkr, 0), 0)), 0) as ship_owed_pkr
from suppliers s
join purchase_orders po on po.supplier_id = s.id and po.status <> all (array['planning', 'approved', 'cancelled']::po_status[])
join purchase_order_lines l on l.purchase_order_id = po.id
group by po.supplier_id, s.name;
