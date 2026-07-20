-- ===========================================================================
-- product_sales_pnl — per-product sold economics for ALL products (from the frozen
-- per-sale snapshot): units sold, revenue, cost of goods sold, and profit. Powers the
-- "Product costs" and revenue drill-down on the metric-detail pages.
-- Internal financial view: authenticated only, never anon.
-- ===========================================================================

create view product_sales_pnl as
select
  p.id                       as product_id,
  p.name,
  p.sku,
  p.owner_kind,
  coalesce(s.qty_sold, 0)    as qty_sold,
  coalesce(s.revenue_pkr, 0) as revenue_pkr,
  coalesce(s.cogs_pkr, 0)    as cogs_pkr,
  coalesce(s.margin_pkr, 0)  as margin_pkr
from products p
join (
  select product_id,
         sum(qty)         as qty_sold,
         sum(revenue_pkr) as revenue_pkr,
         sum(cogs_pkr)    as cogs_pkr,
         sum(margin_pkr)  as margin_pkr
  from sale_margin
  group by product_id
) s on s.product_id = p.id;

grant select on product_sales_pnl to authenticated;
revoke all on product_sales_pnl from anon;
