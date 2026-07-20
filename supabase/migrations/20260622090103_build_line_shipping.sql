-- ===========================================================================
-- Custom Builds — one-off part SHIPPING lifecycle (mirrors the order pipeline).
--
-- Replaces the flat one-off status (sourcing → purchasing_done → delivered, money realized in full
-- at 'delivered') with a shipping lifecycle:
--     sourcing → ready_to_ship   (manual, operator-advanceable)
--     partially_shipped / fully_shipped   (DERIVED from build_lines.qty_shipped)
--
-- Money now realizes PER SHIPPED UNIT, on the day it ships — exactly like an order realizes COGS
-- per delivered unit via the stock-movement ledger. One-off parts have no stock/movements, so this
-- adds their analogue: build_line_shipments (qty + date per shipment). The five financial surfaces
-- (pnl_summary, build_pnl, house_margin_daily, pnl_summary_between, activity_days) switch from
-- "qty * price where status='delivered'" to "qty_shipped * price" (totals) / the shipments ledger
-- (dated series).
--
-- Enum values are REPLACED (not appended), and the enum is a function-param type + column default,
-- so we use the new-type + column-swap path (ALTER TYPE ADD VALUE can't be used in the same batch).
-- ===========================================================================

-- ---- 1. Drop everything that references the old enum value 'delivered' or the enum type ----------
drop view     if exists activity_days;
drop function if exists pnl_summary_between(date, date);
drop view     if exists house_margin_daily;
drop view     if exists build_pnl;
drop view     if exists pnl_summary;
drop function if exists set_build_line_status(uuid, build_line_status);
drop trigger  if exists build_lines_freeze on build_lines;
drop function if exists freeze_delivered_build_line();
alter table build_lines drop constraint if exists build_lines_delivered_dated;
drop policy   if exists build_lines_remove on build_lines;
drop policy   if exists builds_remove on builds;

-- ---- 2. Swap the enum: sourcing / ready_to_ship / partially_shipped / fully_shipped --------------
alter type build_line_status rename to build_line_status_old;
create type build_line_status as enum ('sourcing', 'ready_to_ship', 'partially_shipped', 'fully_shipped');

alter table build_lines alter column status drop default;
alter table build_lines alter column status type build_line_status using (
  (case status::text
     when 'purchasing_done' then 'ready_to_ship'
     when 'delivered'       then 'fully_shipped'
     else 'sourcing'
   end)::build_line_status
);
alter table build_lines alter column status set default 'sourcing';
drop type build_line_status_old;

-- ---- 3. Track shipped units (partial/full is derived from this) ----------------------------------
alter table build_lines add column qty_shipped int not null default 0;
update build_lines set qty_shipped = qty where status = 'fully_shipped';   -- converted 'delivered' rows shipped in full

alter table build_lines add constraint build_lines_qty_shipped_range check (qty_shipped >= 0 and qty_shipped <= qty);
alter table build_lines add constraint build_lines_status_shipped_consistent check (
  (status = 'fully_shipped'     and qty_shipped >= qty)
  or (status = 'partially_shipped' and qty_shipped > 0 and qty_shipped < qty)
  or (status in ('sourcing', 'ready_to_ship') and qty_shipped = 0)
);
alter table build_lines add constraint build_lines_fully_shipped_dated check (status <> 'fully_shipped' or delivered_on is not null);

-- ---- 4. Shipments ledger (the one-off analogue of stock_movements) — immutable, like payments ----
create table build_line_shipments (
  id         uuid primary key default gen_random_uuid(),
  line_id    uuid not null references build_lines(id) on delete cascade,
  qty        int  not null check (qty > 0),
  shipped_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index build_line_shipments_line_idx on build_line_shipments(line_id);

alter table build_line_shipments enable row level security;
grant select, insert on build_line_shipments to authenticated;   -- no update/delete: append-only ledger
create policy build_line_shipments_read  on build_line_shipments for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy build_line_shipments_write on build_line_shipments for insert to authenticated with check (has_role(array['admin','staff']::user_role[]));
revoke all on build_line_shipments from anon;

-- Backfill: converted 'delivered' lines shipped their full qty on delivered_on, so the daily P&L reconciles.
insert into build_line_shipments (line_id, qty, shipped_on)
select id, qty_shipped, coalesce(delivered_on, current_date) from build_lines where qty_shipped > 0;

-- ---- 5. Freeze-on-ship: once a part has shipped units, its money + shipped qty are locked ---------
create or replace function freeze_shipped_build_line() returns trigger language plpgsql as $$
begin
  if old.qty_shipped > 0 then
    if new.landed_cost_pkr <> old.landed_cost_pkr or new.sale_price_pkr <> old.sale_price_pkr then
      raise exception 'A part that has started shipping is locked — cost and price cannot change.' using errcode = 'check_violation';
    end if;
    if new.qty < old.qty_shipped then
      raise exception 'Quantity cannot drop below the % unit(s) already shipped.', old.qty_shipped using errcode = 'check_violation';
    end if;
    if new.qty_shipped < old.qty_shipped then
      raise exception 'Shipped units cannot be reduced — shipments are immutable.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger build_lines_freeze before update on build_lines for each row execute function freeze_shipped_build_line();

-- ---- 6. Delete guards now key on shipped units (was status='delivered') --------------------------
create policy build_lines_remove on build_lines for delete to authenticated
  using (has_role(array['admin','staff']::user_role[]) and qty_shipped = 0);
create policy builds_remove on builds for delete to authenticated
  using (has_role(array['admin','staff']::user_role[]) and not exists (select 1 from build_lines bl where bl.build_id = builds.id and bl.qty_shipped > 0));

-- ---- 7. RPCs -------------------------------------------------------------------------------------
-- Manual advance is limited to the pre-ship stages; shipped states are reached only via ship_build_line.
create or replace function set_build_line_status(p_line_id uuid, p_status build_line_status)
returns void
language plpgsql security definer set search_path = public as $$
declare v_shipped int;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to edit builds.' using errcode = 'check_violation';
  end if;
  if p_status not in ('sourcing', 'ready_to_ship') then
    raise exception 'Shipped stages are set by shipping units, not by hand.' using errcode = 'check_violation';
  end if;
  select qty_shipped into v_shipped from build_lines where id = p_line_id;
  if not found then raise exception 'Build line not found.' using errcode = 'check_violation'; end if;
  if v_shipped > 0 then
    raise exception 'This part has already started shipping and cannot move back.' using errcode = 'check_violation';
  end if;
  update build_lines set status = p_status where id = p_line_id;
end $$;
grant execute on function set_build_line_status(uuid, build_line_status) to authenticated;

-- Ship some units of a one-off part: append an immutable shipment row, bump qty_shipped, derive the
-- stage (partially_shipped / fully_shipped). Row-locks the line (mirrors the fulfil path).
create or replace function ship_build_line(p_line_id uuid, p_qty int, p_shipped_on date default current_date)
returns void
language plpgsql security definer set search_path = public as $$
declare v_line build_lines; v_remaining int; v_new_shipped int;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to ship build parts.' using errcode = 'check_violation';
  end if;
  select * into v_line from build_lines where id = p_line_id for update;
  if not found then raise exception 'Build line not found.' using errcode = 'check_violation'; end if;
  if v_line.status not in ('ready_to_ship', 'partially_shipped') then
    raise exception 'Mark the part Ready to ship before shipping units.' using errcode = 'check_violation';
  end if;
  v_remaining := v_line.qty - v_line.qty_shipped;
  if coalesce(p_qty, 0) <= 0 then raise exception 'Ship at least one unit.' using errcode = 'check_violation'; end if;
  if p_qty > v_remaining then raise exception 'Only % unit(s) left to ship.', v_remaining using errcode = 'check_violation'; end if;

  insert into build_line_shipments (line_id, qty, shipped_on) values (p_line_id, p_qty, coalesce(p_shipped_on, current_date));

  v_new_shipped := v_line.qty_shipped + p_qty;
  update build_lines set
    qty_shipped  = v_new_shipped,
    status       = case when v_new_shipped >= v_line.qty then 'fully_shipped' else 'partially_shipped' end,
    delivered_on = case when v_new_shipped >= v_line.qty then coalesce(v_line.delivered_on, coalesce(p_shipped_on, current_date)) else v_line.delivered_on end
  where id = p_line_id;
end $$;
grant execute on function ship_build_line(uuid, int, date) to authenticated;

-- ---- 8. Financial surfaces — proportional (qty_shipped) + shipment-dated -------------------------

-- pnl_summary (LIVE def from 090060) — bo now sums qty_shipped, all lines (0 for unshipped).
create view pnl_summary as
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
), bo as (
  select coalesce(sum(qty_shipped * sale_price_pkr), 0) as revenue_pkr,
         coalesce(sum(qty_shipped * landed_cost_pkr), 0) as cogs_pkr
  from build_lines
), ops as (
  select coalesce(sum(amount_pkr), 0) as ops_pkr
  from expenses where category in ('operations', 'salaries', 'rent', 'subscriptions', 'other')
), mk as (
  select total_pkr from marketing_spend
), cl as (
  select total_pkr from corrections_loss
), rf as (
  select coalesce(sum(amount_pkr), 0) as total_pkr from refunds
), dl as (
  select coalesce(sum(amount_pkr), 0) as total_pkr from customer_deliveries
)
select
  (sm.revenue_pkr + bo.revenue_pkr)                          as revenue_pkr,
  (sm.cogs_pkr + bo.cogs_pkr)                                as cogs_pkr,
  (sm.gross_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as gross_margin_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as house_margin_pkr,
  sm.investor_share_pkr,
  mk.total_pkr                                               as marketing_pkr,
  cl.total_pkr                                               as corrections_pkr,
  rf.total_pkr                                               as refunds_pkr,
  dl.total_pkr                                               as delivery_pkr,
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr + rf.total_pkr + dl.total_pkr)               as operating_expense_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr) - ops.ops_pkr - mk.total_pkr - cl.total_pkr - rf.total_pkr - dl.total_pkr) as kept_pkr
from sm cross join bo cross join ops cross join mk cross join cl cross join rf cross join dl;
grant select on pnl_summary to authenticated;
revoke all on pnl_summary from anon;

-- house_margin_daily (LIVE def from 090046) — one-off branch is now the shipments ledger, by shipped_on.
create view house_margin_daily as
select day,
  sum(revenue_pkr)::numeric(14,2)      as revenue_pkr,
  sum(gross_margin_pkr)::numeric(14,2) as gross_margin_pkr,
  sum(house_margin_pkr)::numeric(14,2) as house_margin_pkr
from (
  select occurred_on as day, revenue_pkr, margin_pkr as gross_margin_pkr, house_share_pkr as house_margin_pkr
  from sale_margin
  union all
  select s.shipped_on as day,
    (s.qty * l.sale_price_pkr)                       as revenue_pkr,
    (s.qty * (l.sale_price_pkr - l.landed_cost_pkr)) as gross_margin_pkr,
    (s.qty * (l.sale_price_pkr - l.landed_cost_pkr)) as house_margin_pkr
  from build_line_shipments s join build_lines l on l.id = s.line_id
) t
group by day;
grant select on house_margin_daily to authenticated;
revoke all on house_margin_daily from anon;

-- build_pnl (LIVE def from 090046) — oo now sums qty_shipped (realized per unit), no status filter.
create view build_pnl as
with cat as (
  select b.id as build_id,
    coalesce(sum(sm.revenue_pkr), 0)::numeric(14,2)        as catalogue_revenue_pkr,
    coalesce(sum(sm.cogs_pkr), 0)::numeric(14,2)           as catalogue_cogs_pkr,
    coalesce(sum(sm.house_share_pkr), 0)::numeric(14,2)    as catalogue_house_margin_pkr,
    coalesce(sum(sm.investor_share_pkr), 0)::numeric(14,2) as investor_share_pkr
  from builds b
  left join sale_margin sm on sm.order_id = b.order_id
  group by b.id
), oo as (
  select build_id,
    coalesce(sum(qty_shipped * sale_price_pkr), 0)::numeric(14,2) as oneoff_revenue_pkr,
    coalesce(sum(qty_shipped * landed_cost_pkr), 0)::numeric(14,2) as oneoff_cogs_pkr
  from build_lines group by build_id
)
select b.id as build_id, b.build_no, b.name, b.customer_id, b.status, b.order_id,
  cat.catalogue_revenue_pkr, cat.catalogue_cogs_pkr, cat.catalogue_house_margin_pkr, cat.investor_share_pkr,
  coalesce(oo.oneoff_revenue_pkr, 0)::numeric(14,2) as oneoff_revenue_pkr,
  coalesce(oo.oneoff_cogs_pkr, 0)::numeric(14,2)    as oneoff_cogs_pkr,
  (cat.catalogue_revenue_pkr + coalesce(oo.oneoff_revenue_pkr, 0))::numeric(14,2) as revenue_pkr,
  (cat.catalogue_cogs_pkr + coalesce(oo.oneoff_cogs_pkr, 0))::numeric(14,2)       as cogs_pkr,
  (cat.catalogue_house_margin_pkr + (coalesce(oo.oneoff_revenue_pkr, 0) - coalesce(oo.oneoff_cogs_pkr, 0)))::numeric(14,2) as house_profit_pkr
from builds b
join cat on cat.build_id = b.id
left join oo on oo.build_id = b.id;
grant select on build_pnl to authenticated;
revoke all on build_pnl from anon;

-- pnl_summary_between (LIVE def from 090086) — bo now sums the shipments ledger within the window.
create or replace function pnl_summary_between(p_start date, p_end date)
returns table (
  revenue_pkr           numeric,
  cogs_pkr              numeric,
  gross_margin_pkr      numeric,
  house_margin_pkr      numeric,
  investor_share_pkr    numeric,
  marketing_pkr         numeric,
  corrections_pkr       numeric,
  refunds_pkr           numeric,
  delivery_pkr          numeric,
  operating_expense_pkr numeric,
  kept_pkr              numeric
)
language sql stable security invoker set search_path = public as $$
with sm as (
  select coalesce(sum(revenue_pkr), 0) as revenue_pkr, coalesce(sum(cogs_pkr), 0) as cogs_pkr,
         coalesce(sum(margin_pkr), 0) as gross_margin_pkr, coalesce(sum(house_share_pkr), 0) as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
  where occurred_on between p_start and p_end
), bo as (
  select coalesce(sum(s.qty * l.sale_price_pkr), 0) as revenue_pkr,
         coalesce(sum(s.qty * l.landed_cost_pkr), 0) as cogs_pkr
  from build_line_shipments s join build_lines l on l.id = s.line_id
  where s.shipped_on between p_start and p_end
), ops as (
  select coalesce(sum(amount_pkr), 0) as ops_pkr
  from expenses
  where category in ('operations', 'salaries', 'rent', 'subscriptions', 'other')
    and spent_on between p_start and p_end
), mk as (
  select
    coalesce((select sum(amount_pkr) from cash_marketing
              where spent_on between p_start and p_end), 0)
    + coalesce((select sum(cogs_pkr_snap) from stock_movements
                where kind = 'pr_gift' and occurred_on between p_start and p_end), 0) as total_pkr
), cl as (
  select
    coalesce((select sum(amount_pkr) from corrections
              where action = any (array['refund'::correction_action, 'compensation'::correction_action])
                and created_at::date between p_start and p_end), 0)
    + coalesce((select sum(cogs_pkr_snap) from stock_movements
                where kind = 'replacement' and occurred_on between p_start and p_end), 0) as total_pkr
), rf as (
  select coalesce(sum(amount_pkr), 0) as total_pkr
  from refunds
  where refunded_on between p_start and p_end
), dl as (
  select coalesce(sum(amount_pkr), 0) as total_pkr
  from customer_deliveries
  where billed_on between p_start and p_end
)
select
  (sm.revenue_pkr + bo.revenue_pkr)                          as revenue_pkr,
  (sm.cogs_pkr + bo.cogs_pkr)                                as cogs_pkr,
  (sm.gross_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as gross_margin_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr))     as house_margin_pkr,
  sm.investor_share_pkr,
  mk.total_pkr                                               as marketing_pkr,
  cl.total_pkr                                               as corrections_pkr,
  rf.total_pkr                                               as refunds_pkr,
  dl.total_pkr                                               as delivery_pkr,
  (ops.ops_pkr + mk.total_pkr + cl.total_pkr + rf.total_pkr + dl.total_pkr)               as operating_expense_pkr,
  (sm.house_margin_pkr + (bo.revenue_pkr - bo.cogs_pkr) - ops.ops_pkr - mk.total_pkr - cl.total_pkr - rf.total_pkr - dl.total_pkr) as kept_pkr
from sm cross join bo cross join ops cross join mk cross join cl cross join rf cross join dl;
$$;
revoke all on function pnl_summary_between(date, date) from public;
grant execute on function pnl_summary_between(date, date) to authenticated;

-- activity_days (LIVE def from 090095) — one-off activity is now shipment dates.
create view activity_days as
  select occurred_on as day from sale_margin where occurred_on is not null
  union select shipped_on from build_line_shipments
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
