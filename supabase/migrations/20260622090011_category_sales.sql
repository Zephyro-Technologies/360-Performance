-- ===========================================================================
-- 360 Performance — category_sales view (Phase 4, Analytics)
-- Billed line revenue (qty * price_pkr) per invoice line, with the leaf category
-- AND its parent rollup, plus issue_date for date-range filtering. Voided
-- invoices excluded. Deleted-product lines fall back to "Uncategorized".
-- Used for the range-aware "What's selling" breakdown (parent rollup + drill-down).
-- ===========================================================================
create view category_sales as
select
  ii.id          as item_id,
  inv.id         as invoice_id,
  inv.issue_date,
  leaf.id        as category_id,
  coalesce(leaf.name, 'Uncategorized')               as category_name,
  coalesce(parent.id, leaf.id)                        as rollup_id,
  coalesce(parent.name, leaf.name, 'Uncategorized')  as rollup_name,
  ii.qty * ii.price_pkr                               as revenue_pkr
from invoice_items ii
join invoices inv      on inv.id = ii.invoice_id and inv.voided_at is null
left join products p   on p.id = ii.product_id
left join categories leaf   on leaf.id = p.category_id
left join categories parent on parent.id = leaf.parent_id;

grant select on category_sales to authenticated;
