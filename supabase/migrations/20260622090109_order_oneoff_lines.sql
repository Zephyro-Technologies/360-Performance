-- ===========================================================================
-- One-off products ON ORDERS. An order line with no catalogue product carries its own sale price +
-- landed cost (snapshot) and an optional link to the reusable oneoff_products list. It has no stock,
-- so it realizes money house-only PER DELIVERED UNIT via an append-only ledger (order_oneoff_deliveries)
-- — the direct analogue of the old build one-off. Those realized amounts are folded back into the
-- four P&L surfaces (which 090100 left sales-only). sale_margin / investor views are untouched.
-- ===========================================================================

-- ---- 1. Order-line cost + link -------------------------------------------------------------------
alter table order_items add column oneoff_product_id uuid references oneoff_products(id) on delete set null;
alter table order_items add column landed_cost_pkr   numeric(12,2) check (landed_cost_pkr is null or landed_cost_pkr >= 0);

-- ---- 2. Delivery ledger (append-only; analogue of build_line_shipments) ---------------------------
create table order_oneoff_deliveries (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  qty           int  not null check (qty > 0),
  delivered_on  date not null default current_date,
  created_at    timestamptz not null default now()
);
create index order_oneoff_deliveries_item_idx on order_oneoff_deliveries(order_item_id);
alter table order_oneoff_deliveries enable row level security;
grant select, insert on order_oneoff_deliveries to authenticated;   -- no update/delete: immutable ledger
create policy order_oneoff_deliveries_read  on order_oneoff_deliveries for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy order_oneoff_deliveries_write on order_oneoff_deliveries for insert to authenticated with check (has_role(array['admin','staff']::user_role[]));
revoke all on order_oneoff_deliveries from anon;

-- ---- 3. create_order / update_order — accept a product-less one-off line -------------------------
create or replace function create_order(p_customer_id uuid, p_new_customer jsonb, p_items jsonb, p_notes text)
returns orders
language plpgsql security invoker set search_path = public as $$
declare
  v_customer_id uuid := p_customer_id;
  v_cust_type   customer_type;
  v_order orders;
  v_item  jsonb;
begin
  if v_customer_id is null then
    if p_new_customer is null or coalesce(p_new_customer->>'name', '') = '' then
      raise exception 'A customer is required.' using errcode = 'check_violation';
    end if;
    insert into customers (name, type, email, phone, city)
    values (
      p_new_customer->>'name',
      case when p_new_customer->>'type' in ('retail', 'trade', 'workshop') then (p_new_customer->>'type')::customer_type else 'retail' end,
      nullif(p_new_customer->>'email', ''), nullif(p_new_customer->>'phone', ''), nullif(p_new_customer->>'city', '')
    )
    returning id into v_customer_id;
  end if;

  select type into v_cust_type from customers where id = v_customer_id;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item.' using errcode = 'check_violation';
  end if;

  insert into orders (customer_id, notes) values (v_customer_id, nullif(p_notes, '')) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    if coalesce(v_item->>'product_id', '') = '' then
      if coalesce(v_item->>'name', '') = '' then
        raise exception 'A one-off line needs a name.' using errcode = 'check_violation';
      end if;
      insert into order_items (order_id, product_id, name, sku, qty, price_pkr, oneoff_product_id, landed_cost_pkr)
      values (v_order.id, null, v_item->>'name', nullif(v_item->>'sku', ''), (v_item->>'qty')::int,
              coalesce((v_item->>'price_pkr')::numeric, 0),
              nullif(v_item->>'oneoff_product_id', '')::uuid,
              coalesce((v_item->>'landed_cost_pkr')::numeric, 0));
    else
      insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
      select v_order.id, p.id, p.name, p.sku, (v_item->>'qty')::int,
        coalesce((v_item->>'price_pkr')::numeric,
          case when v_cust_type in ('trade', 'workshop') then coalesce(p.reseller_price_pkr, p.price_pkr, 0) else coalesce(p.price_pkr, 0) end)
      from products p where p.id = (v_item->>'product_id')::uuid;
      if not found then raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation'; end if;
    end if;
  end loop;

  update orders set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order.id)
  where id = v_order.id returning * into v_order;
  return v_order;
end $$;

create or replace function update_order(p_id uuid, p_items jsonb)
returns orders
language plpgsql security invoker set search_path = public as $$
declare
  v_order     orders;
  v_cust_type customer_type;
  v_item      jsonb;
begin
  select * into v_order from orders where id = p_id;
  if not found then raise exception 'Order not found.' using errcode = 'no_data_found'; end if;
  if v_order.stage = 'cancelled' then raise exception 'A cancelled order cannot be edited.' using errcode = 'check_violation'; end if;
  if exists (select 1 from order_items where order_id = p_id and qty_delivered > 0) then
    raise exception 'This order already has delivered lines and cannot be edited.' using errcode = 'check_violation';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one item.' using errcode = 'check_violation';
  end if;

  select type into v_cust_type from customers where id = v_order.customer_id;
  delete from order_items where order_id = p_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'qty')::int, 0) <= 0 then
      raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
    end if;
    if coalesce(v_item->>'product_id', '') = '' then
      if coalesce(v_item->>'name', '') = '' then
        raise exception 'A one-off line needs a name.' using errcode = 'check_violation';
      end if;
      insert into order_items (order_id, product_id, name, sku, qty, price_pkr, oneoff_product_id, landed_cost_pkr)
      values (p_id, null, v_item->>'name', nullif(v_item->>'sku', ''), (v_item->>'qty')::int,
              coalesce((v_item->>'price_pkr')::numeric, 0),
              nullif(v_item->>'oneoff_product_id', '')::uuid,
              coalesce((v_item->>'landed_cost_pkr')::numeric, 0));
    else
      insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
      select p_id, p.id, p.name, p.sku, (v_item->>'qty')::int,
        coalesce((v_item->>'price_pkr')::numeric,
          case when v_cust_type in ('trade', 'workshop') then coalesce(p.reseller_price_pkr, p.price_pkr, 0) else coalesce(p.price_pkr, 0) end)
      from products p where p.id = (v_item->>'product_id')::uuid;
      if not found then raise exception 'Product not found: %', v_item->>'product_id' using errcode = 'check_violation'; end if;
    end if;
  end loop;

  update orders set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = p_id)
  where id = p_id returning * into v_order;
  return v_order;
end $$;
revoke all on function update_order(uuid, jsonb) from public;
grant execute on function update_order(uuid, jsonb) to authenticated;

-- ---- 4. fulfil_order_line — deliver a one-off line via the ledger (no stock draw) ----------------
create or replace function fulfil_order_line(p_line_id uuid, p_qty int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_line          order_items%rowtype;
  v_remaining     int;
  v_all_delivered boolean;
  v_any_delivered boolean;
  v_stage         order_stage;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to fulfil orders.' using errcode = 'check_violation';
  end if;
  select * into v_line from order_items where id = p_line_id;
  if v_line.id is null then raise exception 'Order line not found.' using errcode = 'check_violation'; end if;
  v_remaining := v_line.qty - v_line.qty_delivered;
  if p_qty is null or p_qty <= 0 then raise exception 'Delivery quantity must be positive.' using errcode = 'check_violation'; end if;
  if p_qty > v_remaining then raise exception 'Only % left to deliver on this line.', v_remaining using errcode = 'check_violation'; end if;

  if v_line.product_id is null then
    -- one-off product line: no stock; record the delivery in the immutable ledger (house-only money via P&L)
    insert into order_oneoff_deliveries (order_item_id, qty, delivered_on) values (p_line_id, p_qty, current_date);
  else
    perform draw_stock_fifo(v_line.product_id, p_qty, p_line_id, current_date);
  end if;

  update order_items set qty_delivered = qty_delivered + p_qty where id = p_line_id;

  select bool_and(qty_delivered >= qty), bool_or(qty_delivered > 0)
    into v_all_delivered, v_any_delivered from order_items where order_id = v_line.order_id;
  select stage into v_stage from orders where id = v_line.order_id;
  if v_stage <> 'cancelled' then
    if v_all_delivered and v_stage is distinct from 'delivered' then
      update orders set stage = 'delivered' where id = v_line.order_id;
    elsif v_any_delivered and not v_all_delivered and v_stage is distinct from 'partially_delivered' then
      update orders set stage = 'partially_delivered' where id = v_line.order_id;
    end if;
  end if;
end $$;
grant execute on function fulfil_order_line(uuid, int) to authenticated;

-- ---- 5. Fold order one-offs (house-only, per delivered unit) back into the four P&L surfaces ------
create or replace view pnl_summary as
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
), bo as (
  select coalesce(sum(qty_delivered * price_pkr), 0) as revenue_pkr,
         coalesce(sum(qty_delivered * coalesce(landed_cost_pkr, 0)), 0) as cogs_pkr
  from order_items where product_id is null and landed_cost_pkr is not null
), ops as (
  select coalesce(sum(amount_pkr), 0) as ops_pkr
  from expenses where category in ('operations', 'salaries', 'rent', 'subscriptions', 'other')
), mk as (select total_pkr from marketing_spend
), cl as (select total_pkr from corrections_loss
), rf as (select coalesce(sum(amount_pkr), 0) as total_pkr from refunds
), dl as (select coalesce(sum(amount_pkr), 0) as total_pkr from customer_deliveries)
select
  (sm.revenue_pkr + bo.revenue_pkr)                      as revenue_pkr,
  (sm.cogs_pkr + bo.cogs_pkr)                            as cogs_pkr,
  (sm.gross_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr)) as gross_margin_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr)) as house_margin_pkr,
  sm.investor_share_pkr,
  mk.total_pkr as marketing_pkr, cl.total_pkr as corrections_pkr, rf.total_pkr as refunds_pkr, dl.total_pkr as delivery_pkr,
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr + rf.total_pkr + dl.total_pkr) as operating_expense_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr) - ops.ops_pkr - mk.total_pkr - cl.total_pkr - rf.total_pkr - dl.total_pkr) as kept_pkr
from sm cross join bo cross join ops cross join mk cross join cl cross join rf cross join dl;
grant select on pnl_summary to authenticated;
revoke all on pnl_summary from anon;

create or replace view house_margin_daily as
select day,
  sum(revenue_pkr)::numeric(14,2)      as revenue_pkr,
  sum(gross_margin_pkr)::numeric(14,2) as gross_margin_pkr,
  sum(house_margin_pkr)::numeric(14,2) as house_margin_pkr
from (
  select occurred_on as day, revenue_pkr, margin_pkr as gross_margin_pkr, house_share_pkr as house_margin_pkr
  from sale_margin
  union all
  select d.delivered_on as day,
    (d.qty * oi.price_pkr)                                       as revenue_pkr,
    (d.qty * (oi.price_pkr - coalesce(oi.landed_cost_pkr, 0)))   as gross_margin_pkr,
    (d.qty * (oi.price_pkr - coalesce(oi.landed_cost_pkr, 0)))   as house_margin_pkr
  from order_oneoff_deliveries d join order_items oi on oi.id = d.order_item_id
) t
group by day;
grant select on house_margin_daily to authenticated;
revoke all on house_margin_daily from anon;

create or replace function pnl_summary_between(p_start date, p_end date)
returns table (
  revenue_pkr numeric, cogs_pkr numeric, gross_margin_pkr numeric, house_margin_pkr numeric,
  investor_share_pkr numeric, marketing_pkr numeric, corrections_pkr numeric, refunds_pkr numeric,
  delivery_pkr numeric, operating_expense_pkr numeric, kept_pkr numeric
)
language sql stable security invoker set search_path = public as $$
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin where occurred_on between p_start and p_end
), bo as (
  select coalesce(sum(d.qty * oi.price_pkr), 0) as revenue_pkr,
         coalesce(sum(d.qty * coalesce(oi.landed_cost_pkr, 0)), 0) as cogs_pkr
  from order_oneoff_deliveries d join order_items oi on oi.id = d.order_item_id
  where d.delivered_on between p_start and p_end
), ops as (
  select coalesce(sum(amount_pkr), 0) as ops_pkr
  from expenses where category in ('operations', 'salaries', 'rent', 'subscriptions', 'other') and spent_on between p_start and p_end
), mk as (
  select coalesce((select sum(amount_pkr) from cash_marketing where spent_on between p_start and p_end), 0)
    + coalesce((select sum(cogs_pkr_snap) from stock_movements where kind = 'pr_gift' and occurred_on between p_start and p_end), 0) as total_pkr
), cl as (
  select coalesce((select sum(amount_pkr) from corrections
              where action = any (array['refund'::correction_action, 'compensation'::correction_action]) and created_at::date between p_start and p_end), 0)
    + coalesce((select sum(cogs_pkr_snap) from stock_movements where kind = 'replacement' and occurred_on between p_start and p_end), 0) as total_pkr
), rf as (select coalesce(sum(amount_pkr), 0) as total_pkr from refunds where refunded_on between p_start and p_end
), dl as (select coalesce(sum(amount_pkr), 0) as total_pkr from customer_deliveries where billed_on between p_start and p_end)
select
  (sm.revenue_pkr + bo.revenue_pkr), (sm.cogs_pkr + bo.cogs_pkr),
  (sm.gross_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr)), (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr)),
  sm.investor_share_pkr, mk.total_pkr, cl.total_pkr, rf.total_pkr, dl.total_pkr,
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr + rf.total_pkr + dl.total_pkr),
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr) - ops.ops_pkr - mk.total_pkr - cl.total_pkr - rf.total_pkr - dl.total_pkr)
from sm cross join bo cross join ops cross join mk cross join cl cross join rf cross join dl;
$$;
revoke all on function pnl_summary_between(date, date) from public;
grant execute on function pnl_summary_between(date, date) to authenticated;

create or replace view activity_days as
  select occurred_on as day from sale_margin where occurred_on is not null
  union select delivered_on from order_oneoff_deliveries
  union select spent_on from expenses
  union select spent_on from cash_marketing
  union select occurred_on from stock_movements where kind in ('pr_gift', 'replacement')
  union select created_at::date from corrections where action in ('refund', 'compensation')
  union select refunded_on from refunds
  union select billed_on from customer_deliveries
  union select paid_on from payments
  union select issue_date from invoices where voided_at is null;
grant select on activity_days to authenticated;
revoke all   on activity_days from anon;
