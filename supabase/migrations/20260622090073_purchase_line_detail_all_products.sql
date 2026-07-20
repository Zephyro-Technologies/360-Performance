-- ===========================================================================
-- purchase_line_detail — start from PRODUCTS (left-join the purchases) so a product that has
-- been created but not yet ordered still shows one row (with empty cost / no PO). A product
-- with N purchases still yields N rows; line_id is null for the not-yet-ordered case.
-- Same columns/order as 090072 (create or replace preserves the grants).
-- ===========================================================================
create or replace view purchase_line_detail as
select
  plc.id                            as line_id,
  plc.purchase_order_id,
  p.id                              as product_id,
  p.name                            as product_name,
  p.sku,
  p.category_id,
  p.owner_kind,
  p.price_pkr                       as retail_pkr,
  p.reseller_price_pkr              as reseller_pkr,
  plc.qty_ordered,
  plc.qty_received,
  plc.unit_cost_pkr,
  plc.shipping_per_unit_pkr,
  plc.packaging_per_unit_pkr,
  plc.landed_cost_per_unit_pkr,
  plc.landed_total_pkr,
  plc.item_paid_amount_pkr,
  plc.item_paid_on,
  plc.ship_paid_amount_pkr,
  plc.ship_paid_on,
  coalesce(mv.qty_sold, 0)::int     as qty_sold,
  coalesce(mv.qty_pr, 0)::int       as qty_pr,
  s.name                            as vendor_name,
  po.status                         as po_status,
  po.created_at                     as po_created_at
from products p
left join purchase_order_lines_costed plc on plc.product_id = p.id
left join purchase_orders po on po.id = plc.purchase_order_id
left join suppliers  s  on s.id = po.supplier_id
left join (
  select b.source_po_line_id as line_id,
    coalesce(sum(sm.qty) filter (where sm.kind = 'sale'), 0)    as qty_sold,
    coalesce(sum(sm.qty) filter (where sm.kind = 'pr_gift'), 0) as qty_pr
  from batches b
  join stock_movements sm on sm.batch_id = b.id
  where b.source_po_line_id is not null
  group by b.source_po_line_id
) mv on mv.line_id = plc.id;
