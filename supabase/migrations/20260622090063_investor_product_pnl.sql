-- ===========================================================================
-- investor_product_pnl — a per-product breakdown for every investor-owned product:
-- what each unit cost, how many sold, the profit per unit, the investor's cut vs the
-- house's cut, the investor's capital returned, and what's still sitting in stock (their
-- capital still tied up). Powers the detailed table on the Investors page.
--
-- Ownership is product-level (a product is wholly one investor's), so we can aggregate the
-- snapshotted sale economics (sale_margin) straight to the product, and read on-hand value
-- from product_cost. Internal financial view: authenticated only, never anon.
-- ===========================================================================

create view investor_product_pnl as
select
  p.id                                as product_id,
  p.name,
  p.sku,
  p.investor_deal_id,
  d.investor_id,
  inv.name                            as investor_name,
  d.split_pct,
  -- sold economics (per product, from the frozen per-sale snapshot)
  coalesce(s.qty_sold, 0)             as qty_sold,
  coalesce(s.revenue_pkr, 0)          as revenue_pkr,
  coalesce(s.cogs_pkr, 0)             as capital_returned_pkr,   -- cost of sold units = investor's money back
  coalesce(s.margin_pkr, 0)           as profit_pkr,             -- total profit on sold units
  coalesce(s.investor_share_pkr, 0)   as investor_share_pkr,     -- investor's cut of that profit
  coalesce(s.house_share_pkr, 0)      as house_share_pkr,        -- your cut
  -- per-unit figures (average over the units sold; falls back to on-hand cost when nothing sold yet)
  case when coalesce(s.qty_sold, 0) > 0 then round(s.cogs_pkr / s.qty_sold, 2)
       else pc.weighted_avg_cost_pkr end                         as cost_per_unit_pkr,
  case when coalesce(s.qty_sold, 0) > 0 then round(s.revenue_pkr / s.qty_sold, 2)
       else null end                                             as sold_price_per_unit_pkr,
  case when coalesce(s.qty_sold, 0) > 0 then round(s.margin_pkr / s.qty_sold, 2)
       else null end                                             as profit_per_unit_pkr,
  -- still in stock = investor capital not yet returned
  coalesce(pc.on_hand_qty, 0)         as on_hand_qty,
  coalesce(pc.stock_value_pkr, 0)     as on_hand_value_pkr
from products p
join investor_deals d on d.id = p.investor_deal_id
join investors inv    on inv.id = d.investor_id
left join (
  select product_id,
         sum(qty)                as qty_sold,
         sum(revenue_pkr)        as revenue_pkr,
         sum(cogs_pkr)           as cogs_pkr,
         sum(margin_pkr)         as margin_pkr,
         sum(investor_share_pkr) as investor_share_pkr,
         sum(house_share_pkr)    as house_share_pkr
  from sale_margin
  group by product_id
) s on s.product_id = p.id
left join product_cost pc on pc.product_id = p.id
where p.owner_kind = 'investor';

grant select on investor_product_pnl to authenticated;
revoke all on investor_product_pnl from anon;
