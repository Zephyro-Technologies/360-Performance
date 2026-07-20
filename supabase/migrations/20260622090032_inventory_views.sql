-- ===========================================================================
-- Phase 2 — derived views. Stock + weighted-average cost are computed from the
-- immutable batch + movement ledger (never stored). products_public is rebuilt to
-- source availability + stock from product_inventory (same anon column shape, no cost).
-- ===========================================================================

-- Per-batch on-hand = Σ signed movements (receive/adjust_add +, sale/pr_gift/replacement/
-- adjust_remove -, reversal = opposite of its target). INTERNAL (carries landed cost).
create view batch_on_hand as
select b.id as batch_id, b.product_id, b.source_po_line_id, b.landed_cost_pkr, b.received_on,
  coalesce(sum(case
    when m.kind = 'reversal'                then case when t.kind in ('receive','adjust_add') then -m.qty else m.qty end
    when m.kind in ('receive','adjust_add') then m.qty
    else -m.qty end), 0) as remaining
from batches b
left join stock_movements m on m.batch_id = b.id
left join stock_movements t on t.id = m.reverses_id
group by b.id, b.product_id, b.source_po_line_id, b.landed_cost_pkr, b.received_on;

-- Per-product stock + derived availability. ANON-SAFE shape (qty + availability, no cost).
-- made_to_order ("sourced via PO") wins the display; otherwise availability reflects real
-- batch stock.
create view product_inventory as
select p.id as product_id,
  coalesce(sum(boh.remaining), 0)::int                                  as on_hand_qty,
  coalesce(count(boh.batch_id) filter (where boh.remaining > 0), 0)::int as batch_count,
  case
    when p.made_to_order                              then 'made_to_order'::availability
    when coalesce(sum(boh.remaining), 0) <= 0         then 'out_of_stock'::availability
    when coalesce(sum(boh.remaining), 0) <= p.low_stock_threshold then 'low_stock'::availability
    else 'in_stock'::availability
  end as availability
from products p
left join batch_on_hand boh on boh.product_id = p.id
group by p.id, p.made_to_order, p.low_stock_threshold;

-- Per-product DERIVED weighted-average cost (display / margin only — the batch landed
-- cost stays the source of truth). Weighted by current on-hand. INTERNAL.
create view product_cost as
select product_id,
  sum(remaining)                       as on_hand_qty,
  sum(remaining * landed_cost_pkr)     as stock_value_pkr,
  case when sum(remaining) > 0
       then round(sum(remaining * landed_cost_pkr) / sum(remaining), 2)
       else null end                   as weighted_avg_cost_pkr
from batch_on_hand
where remaining > 0
group by product_id;

-- Accounts payable per product-source vendor: item + ship cost on ordered-or-later POs
-- whose respective payable is not yet marked paid. INTERNAL.
create view vendor_payables as
select s.id as supplier_id, s.name,
  coalesce(sum(case when l.item_paid_on is null
                    then round(l.qty_ordered * l.unit_cost_rmb * coalesce(po.frozen_rate_rmb_pkr, 0), 2)
                    else 0 end), 0) as item_owed_pkr,
  coalesce(sum(case when l.ship_paid_on is null
                    then round(l.qty_ordered * l.shipping_per_unit_pkr, 2)
                    else 0 end), 0) as ship_owed_pkr
from suppliers s
join purchase_orders po       on po.supplier_id = s.id and po.status not in ('planning','approved','cancelled')
join purchase_order_lines l   on l.purchase_order_id = po.id
group by s.id, s.name;

-- PO lines with the landed-cost build-up resolved (unit RMB × frozen rate + shipping +
-- packaging). INTERNAL — the PO editor's cost view.
create view purchase_order_lines_costed as
select l.id, l.purchase_order_id, l.product_id, l.qty_ordered, l.qty_received,
  l.unit_cost_rmb, l.shipping_per_unit_pkr, l.packaging_per_unit_pkr,
  l.item_paid_amount_pkr, l.item_paid_on, l.ship_paid_amount_pkr, l.ship_paid_on,
  po.frozen_rate_rmb_pkr,
  round(l.unit_cost_rmb * coalesce(po.frozen_rate_rmb_pkr, 0), 2) as unit_cost_pkr,
  round(l.unit_cost_rmb * coalesce(po.frozen_rate_rmb_pkr, 0) + l.shipping_per_unit_pkr + l.packaging_per_unit_pkr, 2) as landed_cost_per_unit_pkr,
  round((l.unit_cost_rmb * coalesce(po.frozen_rate_rmb_pkr, 0) + l.shipping_per_unit_pkr + l.packaging_per_unit_pkr) * l.qty_ordered, 2) as landed_total_pkr
from purchase_order_lines l
join purchase_orders po on po.id = l.purchase_order_id;

-- Rebuild the storefront view: availability + stock now come from product_inventory.
-- Same column list/order as before (anon surface unchanged); cost still excluded.
create view products_public as
select
  p.id, p.slug, p.name, p.brand, p.category_id,
  c.slug as category_slug, c.name as category_name,
  p.price_pkr, p.short_description, p.description, p.images, p.specs,
  pi.availability, p.featured, p.created_at,
  coalesce(parent.slug, c.slug) as parent_slug,
  coalesce(parent.name, c.name) as parent_name,
  p.sku, p.mpn, p.meta_description, p.sale_price_pkr, pi.on_hand_qty as stock_qty,
  coalesce(p.sale_price_pkr, p.price_pkr) as effective_price_pkr
from products p
join categories c on c.id = p.category_id
left join categories parent on parent.id = c.parent_id
join product_inventory pi on pi.product_id = p.id
where p.published and p.visibility = 'visible';

grant select on products_public to anon, authenticated;
