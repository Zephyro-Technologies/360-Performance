-- ===========================================================================
-- Phase 4 — investor settlement views (owed balance + the P&L house-share carve-out),
-- the payout guard, and RLS. Reads the Phase 3 sale movements' ACTUAL per-batch cost.
-- ===========================================================================

-- Per `sale` movement on an INVESTOR product: the specific-identification accrual.
-- capital_pkr reads batches.landed_cost_pkr (the ACTUAL batch the FIFO sale drew) — never
-- the weighted-average. investor_share is rounded; accrued = capital + investor_share.
create view investor_sale_accrual as
select
  inv.id   as investor_id,
  d.id     as deal_id,
  d.split_pct,
  sm.id    as movement_id,
  oi.id    as order_item_id,
  sm.qty,
  ba.landed_cost_pkr,
  oi.price_pkr,
  (sm.qty * ba.landed_cost_pkr)::numeric(14,2)                                      as capital_pkr,
  (sm.qty * (oi.price_pkr - ba.landed_cost_pkr))::numeric(14,2)                     as profit_pkr,
  round(d.split_pct * sm.qty * (oi.price_pkr - ba.landed_cost_pkr), 2)              as investor_share_pkr,
  ((sm.qty * ba.landed_cost_pkr)
     + round(d.split_pct * sm.qty * (oi.price_pkr - ba.landed_cost_pkr), 2))::numeric(14,2) as accrued_pkr
from stock_movements sm
join batches        ba on ba.id = sm.batch_id
join order_items    oi on oi.id = sm.order_item_id
join products       p  on p.id  = oi.product_id
join investor_deals d  on d.id  = p.investor_deal_id
join investors      inv on inv.id = d.investor_id
where sm.kind = 'sale' and p.owner_kind = 'investor';

-- Per investor: owed = Σ accrued (from sales) − Σ net payouts. The closed subledger.
create view investor_owed as
select inv.id as investor_id, inv.name, inv.active,
  coalesce(acc.accrued_pkr, 0)::numeric(14,2)                          as accrued_pkr,
  coalesce(pay.paid_pkr, 0)::numeric(14,2)                            as paid_out_pkr,
  (coalesce(acc.accrued_pkr, 0) - coalesce(pay.paid_pkr, 0))::numeric(14,2) as owed_pkr
from investors inv
left join (select investor_id, sum(accrued_pkr) as accrued_pkr from investor_sale_accrual group by investor_id) acc
  on acc.investor_id = inv.id
left join (select investor_id, sum(case when kind = 'payout' then amount_pkr else -amount_pkr end) as paid_pkr
           from investor_payouts group by investor_id) pay
  on pay.investor_id = inv.id;

-- The P&L carve-out source — per `sale` movement (house AND investor). margin = revenue −
-- actual batch COGS. The owner takes the margin: house → 100%; investor → house gets the
-- REMAINDER after the (rounded) investor share, so capital + investor_share + house_share
-- reconciles to revenue to the cent. Investor sales never post their full margin to house.
create view sale_margin as
select
  sm.id      as movement_id,
  oi.id      as order_item_id,
  oi.order_id,
  p.id       as product_id,
  p.owner_kind,
  d.investor_id,
  sm.occurred_on,
  sm.qty,
  (sm.qty * oi.price_pkr)::numeric(14,2)                          as revenue_pkr,
  (sm.qty * ba.landed_cost_pkr)::numeric(14,2)                    as cogs_pkr,
  (sm.qty * (oi.price_pkr - ba.landed_cost_pkr))::numeric(14,2)   as margin_pkr,
  case when p.owner_kind = 'investor'
       then round(d.split_pct * sm.qty * (oi.price_pkr - ba.landed_cost_pkr), 2)
       else 0 end                                                 as investor_share_pkr,
  case when p.owner_kind = 'investor'
       then ((sm.qty * (oi.price_pkr - ba.landed_cost_pkr)) - round(d.split_pct * sm.qty * (oi.price_pkr - ba.landed_cost_pkr), 2))::numeric(14,2)
       else (sm.qty * (oi.price_pkr - ba.landed_cost_pkr))::numeric(14,2) end as house_share_pkr
from stock_movements sm
join batches     ba on ba.id = sm.batch_id
join order_items oi on oi.id = sm.order_item_id
join products    p  on p.id  = oi.product_id
left join investor_deals d on d.id = p.investor_deal_id
where sm.kind = 'sale';

-- House margin by delivery day (for the dashboard time-series).
create view house_margin_daily as
select occurred_on as day,
  sum(revenue_pkr)::numeric(14,2)     as revenue_pkr,
  sum(margin_pkr)::numeric(14,2)      as gross_margin_pkr,
  sum(house_share_pkr)::numeric(14,2) as house_margin_pkr
from sale_margin group by occurred_on;

-- Re-based P&L totals. "What you kept" = house margin-share − OPERATING expenses
-- (marketing/operations/salaries only — inventory/shipping are now in batch COGS, never
-- double-counted). The investor subledger is NOT here (zero-P&L, I-5).
create view pnl_summary as
with sm as (
  select coalesce(sum(revenue_pkr), 0)        as revenue_pkr,
         coalesce(sum(cogs_pkr), 0)           as cogs_pkr,
         coalesce(sum(margin_pkr), 0)         as gross_margin_pkr,
         coalesce(sum(house_share_pkr), 0)    as house_margin_pkr,
         coalesce(sum(investor_share_pkr), 0) as investor_share_pkr
  from sale_margin
), opex as (
  select coalesce(sum(amount_pkr), 0) as operating_expense_pkr
  from expenses where category in ('marketing', 'operations', 'salaries')
)
select sm.revenue_pkr, sm.cogs_pkr, sm.gross_margin_pkr, sm.house_margin_pkr, sm.investor_share_pkr,
  opex.operating_expense_pkr,
  (sm.house_margin_pkr - opex.operating_expense_pkr)::numeric(14,2) as kept_pkr
from sm cross join opex;

-- Guard: reversal integrity + a payout can never exceed the amount owed (accrued − paid).
create or replace function guard_investor_payout() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_accrued      numeric;
  v_paid         numeric;
  v_ref_kind     payout_kind;
  v_ref_amt      numeric;
  v_ref_investor uuid;
  v_ref_rev      uuid;
begin
  if new.kind = 'reversal' then
    if new.reverses_id is null then
      raise exception 'A reversal must reference the payout it corrects.' using errcode = 'check_violation';
    end if;
    select kind, amount_pkr, investor_id, reverses_id into v_ref_kind, v_ref_amt, v_ref_investor, v_ref_rev
      from investor_payouts where id = new.reverses_id;
    if v_ref_kind is null then raise exception 'The payout being reversed was not found.' using errcode = 'check_violation'; end if;
    if v_ref_investor <> new.investor_id then raise exception 'A reversal must be for the same investor.' using errcode = 'check_violation'; end if;
    if new.kind = v_ref_kind then raise exception 'A reversal must be the opposite kind of the entry it corrects.' using errcode = 'check_violation'; end if;
    if new.amount_pkr <> v_ref_amt then raise exception 'A reversal must match the amount of the entry it corrects.' using errcode = 'check_violation'; end if;
    if v_ref_rev is not null then raise exception 'You cannot reverse a reversal row.' using errcode = 'check_violation'; end if;
  elsif new.reverses_id is not null then
    raise exception 'Only a reversal may reference another payout.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(accrued_pkr), 0) into v_accrued from investor_sale_accrual where investor_id = new.investor_id;
  select coalesce(sum(case when kind = 'payout' then amount_pkr else -amount_pkr end), 0) into v_paid
    from investor_payouts where investor_id = new.investor_id;
  v_paid := v_paid + (case when new.kind = 'payout' then new.amount_pkr else -new.amount_pkr end);
  if v_paid > v_accrued then
    raise exception 'Payout exceeds the amount owed to this investor (owed %, payouts would total %).', v_accrued, v_paid using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger investor_payouts_guard before insert on investor_payouts for each row execute function guard_investor_payout();

-- ---- RLS + grants + anon-hardening ----------------------------------------
alter table investors        enable row level security;
alter table investor_deals   enable row level security;
alter table investor_payouts enable row level security;

grant select, insert, update, delete on investors, investor_deals, investor_payouts to authenticated;
grant select on investor_sale_accrual, investor_owed, sale_margin, house_margin_daily, pnl_summary to authenticated;

create policy investors_read  on investors      for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy investors_write on investors      for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy deals_read      on investor_deals for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy deals_write     on investor_deals for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

-- payouts: append-only ledger — staff post a payout, admin posts a reversal; NO update/delete.
create policy payouts_read on investor_payouts for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy payouts_ins  on investor_payouts for insert to authenticated with check (
      (kind <> 'reversal' and has_role(array['admin','staff']::user_role[]))
   or (kind  = 'reversal' and has_role(array['admin']::user_role[]))
);

revoke all on investors, investor_deals, investor_payouts from anon;
revoke all on investor_sale_accrual, investor_owed, sale_margin, house_margin_daily, pnl_summary from anon;
