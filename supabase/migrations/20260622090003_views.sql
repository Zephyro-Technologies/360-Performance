-- ===========================================================================
-- 360 Performance — derived views
-- ===========================================================================

-- Canonical invoice status/balance (never stored).
create view invoice_balances as
select
  i.id as invoice_id,
  i.total_pkr,
  coalesce(sum(p.amount_pkr), 0)                  as paid_pkr,
  i.total_pkr - coalesce(sum(p.amount_pkr), 0)    as balance_pkr,
  case
    when i.voided_at is not null then 'void'
    when coalesce(sum(p.amount_pkr), 0) >= i.total_pkr then 'paid'
    when coalesce(sum(p.amount_pkr), 0) > 0
         and i.due_date is not null and i.due_date < current_date then 'overdue'
    when coalesce(sum(p.amount_pkr), 0) > 0 then 'partial'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    else 'unpaid'
  end as status
from invoices i
left join payments p on p.invoice_id = i.id
group by i.id;

-- Real daily revenue (paid) + expenses — replaces the synthetic revenueTrend.
create view analytics_daily as
with rev as (
  select paid_on as day, sum(amount_pkr) as revenue_pkr
  from payments where amount_pkr > 0 group by paid_on
),
exp as (
  select spent_on as day, sum(amount_pkr) as expense_pkr
  from expenses group by spent_on
)
select
  coalesce(rev.day, exp.day)   as day,
  coalesce(rev.revenue_pkr, 0) as revenue_pkr,
  coalesce(exp.expense_pkr, 0) as expense_pkr
from rev
full outer join exp on rev.day = exp.day;

-- ---------------------------------------------------------------------------
-- products_public — the ONLY product data the anon (website) role may read.
-- Column allow-list: NO cost_pkr / retail_price_sea_pkr / total_end_cost_* /
-- supplier_id / cost_currency / weight_kg / visibility (B2). The view runs with
-- its owner's rights, so it also bakes in the published+visible filter; anon is
-- REVOKEd from the base products table entirely (see RLS migration).
-- ---------------------------------------------------------------------------
create view products_public as
select
  p.id,
  p.slug,
  p.name,
  p.brand,
  p.category_id,
  c.slug as category_slug,
  c.name as category_name,
  p.price_pkr,
  p.short_description,
  p.description,
  p.images,
  p.specs,
  p.availability,
  p.featured,
  p.created_at
from products p
join categories c on c.id = p.category_id
where p.published and p.visibility = 'visible';
