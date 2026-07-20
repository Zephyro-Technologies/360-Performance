-- ===========================================================================
-- product_pnl — one row per product with the economics the Investor catalogue table shows:
-- received/on-hand quantities, landed cost, realized sales split by customer tier
-- (retail vs trade/workshop = reseller), COGS of what sold, and the latest Purchase Order's
-- vendor + status. Retail/reseller prices + markups + gross-profit % are derived in the client
-- from these columns and the product's own prices.
--
-- B2-SENSITIVE (landed cost / COGS): granted to authenticated only, revoked from anon — it is
-- never part of the public surface (products_public). Owner-agnostic; the UI filters to investor.
-- ===========================================================================
create view product_pnl as
with recv as (
  select product_id, sum(qty_received) as received_qty from batches group by product_id
),
sold as (
  select oi.product_id,
    sum(sm.qty)                                                                        as qty_sold,
    sum(case when cu.type in ('trade', 'workshop') then 0 else sm.qty * oi.price_pkr end) as revenue_retail_pkr,
    sum(case when cu.type in ('trade', 'workshop') then sm.qty * oi.price_pkr else 0 end) as revenue_reseller_pkr,
    sum(sm.qty * ba.landed_cost_pkr)                                                   as cogs_sold_pkr
  from stock_movements sm
  join order_items oi on oi.id = sm.order_item_id
  join orders      o  on o.id  = oi.order_id
  join customers   cu on cu.id = o.customer_id
  join batches     ba on ba.id = sm.batch_id
  where sm.kind = 'sale'
  group by oi.product_id
),
vend as (
  -- latest PO per product carries the current vendor + supply-chain status
  select distinct on (pol.product_id) pol.product_id, s.name as vendor_name, po.status as po_status
  from purchase_order_lines pol
  join purchase_orders po on po.id = pol.purchase_order_id
  left join suppliers   s  on s.id = po.supplier_id
  order by pol.product_id, po.created_at desc
)
select
  p.id                                                as product_id,
  coalesce(recv.received_qty, 0)::int                 as received_qty,
  coalesce(pi.on_hand_qty, 0)::int                    as on_hand_qty,
  coalesce(pc.weighted_avg_cost_pkr, 0)::numeric(14,2) as landed_cost_unit_pkr,
  coalesce(sold.qty_sold, 0)::int                     as qty_sold,
  coalesce(sold.revenue_retail_pkr, 0)::numeric(14,2)   as revenue_retail_pkr,
  coalesce(sold.revenue_reseller_pkr, 0)::numeric(14,2) as revenue_reseller_pkr,
  coalesce(sold.cogs_sold_pkr, 0)::numeric(14,2)      as cogs_sold_pkr,
  vend.vendor_name                                    as vendor_name,
  vend.po_status                                      as po_status
from products p
left join product_cost      pc   on pc.product_id = p.id
left join product_inventory pi   on pi.product_id = p.id
left join recv                   on recv.product_id = p.id
left join sold                   on sold.product_id = p.id
left join vend                   on vend.product_id = p.id;

grant select on product_pnl to authenticated;
revoke all on product_pnl from anon;
