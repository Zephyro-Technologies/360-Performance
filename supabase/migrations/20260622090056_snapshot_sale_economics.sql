-- ============================================================================
-- Fix Group 3 (C3) — SNAPSHOT the sale economics onto each stock movement.
--
-- Today sale_margin / investor_sale_accrual / order_cogs / marketing_spend / corrections_loss
-- resolve a realized sale's COST, OWNER and SPLIT by LIVE JOINS to batches.landed_cost_pkr,
-- products.owner_kind/investor_deal_id and investor_deals.split_pct. So editing a batch's landed
-- cost, a product's owner/deal, or a deal's split_pct RETROACTIVELY rewrites past sales (proven:
-- split 0.40->0.90 moved a paid investor's owed 1200->1450; cost 1000->200 moved it to 1370).
-- Group-2 H1 froze order_items.price_pkr but this owner/split/cost path was still live.
--
-- Fix: at INSERT time, snapshot the COMPUTED per-movement outcome onto the movement — owner,
-- investor_id, cost (capital), investor profit share, house share — so the money views read frozen
-- pre-computed amounts with (near) zero live joins, and later edits to the product/deal/batch
-- cannot touch history. Captured PER MOVEMENT: draw_stock_fifo emits one movement per FIFO batch,
-- so each movement freezes ITS OWN batch's landed cost and ITS OWN shares — specific-ID, never a
-- blended/weighted cost (preserves the Phase-4 specific-ID invariant).
--
-- Snapshot == the current live value, so NO number changes for an un-edited sale (proven by the
-- carve-out reconciliation). Revenue stays on order_items.price_pkr (already frozen by H1).
-- ============================================================================

-- ---- 1. Snapshot columns (nullable; populated for cost-bearing kinds sale/pr_gift/replacement) --
alter table stock_movements
  add column owner_kind_snap        owner_kind,
  add column investor_id_snap       uuid,
  add column cogs_pkr_snap          numeric(14,2),   -- qty x batch landed_cost (investor capital / house COGS)
  add column investor_share_pkr_snap numeric(14,2),  -- investor profit share (0 for house)
  add column house_share_pkr_snap   numeric(14,2);   -- house margin share

-- ---- 2. Capture trigger — freezes each movement's economics at insert time, from ITS batch. ----
-- A BEFORE INSERT trigger (not draw_stock_fifo) so EVERY insert path is covered uniformly — the
-- three RPCs and any direct insert — with no change to the money-path RPC and no test churn.
create or replace function snapshot_movement_economics()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_cost   numeric(12,2);
  v_owner  owner_kind;
  v_deal   uuid;
  v_split  numeric(5,4);
  v_inv    uuid;
  v_price  numeric(12,2);
  v_margin numeric;
begin
  if new.kind not in ('sale', 'pr_gift', 'replacement') then
    return new;   -- receive / adjust_* / reversal carry no economics
  end if;
  -- specific-ID: cost + owner/deal come from THIS movement's own FIFO batch, not a blend.
  select b.landed_cost_pkr, p.owner_kind, p.investor_deal_id
    into v_cost, v_owner, v_deal
    from batches b join products p on p.id = b.product_id
    where b.id = new.batch_id;
  new.owner_kind_snap := v_owner;
  new.cogs_pkr_snap   := (new.qty::numeric * v_cost)::numeric(14,2);

  if new.kind = 'sale' then
    select price_pkr into v_price from order_items where id = new.order_item_id;
    v_margin := new.qty::numeric * (v_price - v_cost);
    if v_owner = 'investor' then
      select split_pct, investor_id into v_split, v_inv from investor_deals where id = v_deal;
      new.investor_id_snap        := v_inv;
      new.investor_share_pkr_snap := round(v_split * v_margin, 2);
      new.house_share_pkr_snap    := (v_margin - round(v_split * v_margin, 2))::numeric(14,2);
    else
      new.investor_share_pkr_snap := 0;
      new.house_share_pkr_snap    := v_margin::numeric(14,2);
    end if;
  else
    -- pr_gift / replacement: house-stock-only, cost-bearing, no revenue split.
    new.investor_share_pkr_snap := 0;
    new.house_share_pkr_snap    := 0;
  end if;
  return new;
end $$;

create trigger snapshot_movement_economics
  before insert on stock_movements
  for each row execute function snapshot_movement_economics();

-- ---- 3. Backfill existing cost-bearing movements from CURRENT live values (== what the views ----
-- ---- output today, so no number changes). No-op on a fresh local DB (0 movements); correct -----
-- ---- for the post-cutover real-data case. -------------------------------------------------------
update stock_movements sm set
  owner_kind_snap         = p.owner_kind,
  investor_id_snap        = case when p.owner_kind = 'investor' then d.investor_id end,
  cogs_pkr_snap           = (sm.qty::numeric * ba.landed_cost_pkr)::numeric(14,2),
  investor_share_pkr_snap = case when p.owner_kind = 'investor'
                              then round(d.split_pct * sm.qty::numeric * (oi.price_pkr - ba.landed_cost_pkr), 2)
                              else 0 end,
  house_share_pkr_snap    = case when p.owner_kind = 'investor'
                              then (sm.qty::numeric * (oi.price_pkr - ba.landed_cost_pkr)
                                    - round(d.split_pct * sm.qty::numeric * (oi.price_pkr - ba.landed_cost_pkr), 2))::numeric(14,2)
                              else (sm.qty::numeric * (oi.price_pkr - ba.landed_cost_pkr))::numeric(14,2) end
from batches ba
  join products p on p.id = ba.product_id
  left join investor_deals d on d.id = p.investor_deal_id,
  order_items oi
where sm.batch_id = ba.id and oi.id = sm.order_item_id
  and sm.kind = 'sale' and sm.cogs_pkr_snap is null;

update stock_movements sm set
  owner_kind_snap         = p.owner_kind,
  cogs_pkr_snap           = (sm.qty::numeric * ba.landed_cost_pkr)::numeric(14,2),
  investor_share_pkr_snap = 0,
  house_share_pkr_snap    = 0
from batches ba join products p on p.id = ba.product_id
where sm.batch_id = ba.id and sm.kind in ('pr_gift', 'replacement') and sm.cogs_pkr_snap is null;

-- Cost-bearing movements must carry a cost snapshot (trigger + backfill guarantee it) — this makes
-- the snapshot-only views null-safe. VALID immediately because backfill populated existing rows.
alter table stock_movements add constraint stock_movements_econ_snapshotted
  check (kind not in ('sale', 'pr_gift', 'replacement') or cogs_pkr_snap is not null);

-- ---- 4. Switch the money views from LIVE-JOIN to the frozen snapshot. ---------------------------
-- sale_margin: same output columns/types (CREATE OR REPLACE keeps build_pnl/house_margin_daily/
-- pnl_summary intact). Revenue via the frozen order_items.price_pkr; cost/owner/split from snapshot.
create or replace view sale_margin as
select
  sm.id                                                      as movement_id,
  oi.id                                                      as order_item_id,
  oi.order_id,
  oi.product_id,
  sm.owner_kind_snap                                         as owner_kind,
  sm.investor_id_snap                                        as investor_id,
  sm.occurred_on,
  sm.qty,
  (sm.qty::numeric * oi.price_pkr)::numeric(14,2)            as revenue_pkr,
  sm.cogs_pkr_snap                                           as cogs_pkr,
  ((sm.qty::numeric * oi.price_pkr) - sm.cogs_pkr_snap)::numeric(14,2) as margin_pkr,
  sm.investor_share_pkr_snap::numeric                        as investor_share_pkr,
  sm.house_share_pkr_snap                                    as house_share_pkr
from stock_movements sm
  join order_items oi on oi.id = sm.order_item_id
where sm.kind = 'sale'::movement_kind;

create or replace view order_cogs as
select sm.order_item_id, oi.order_id,
  sum(sm.qty)           as qty_sold,
  sum(sm.cogs_pkr_snap) as cogs_pkr
from stock_movements sm
  join order_items oi on oi.id = sm.order_item_id
where sm.kind = 'sale'::movement_kind
group by sm.order_item_id, oi.order_id;

create or replace view marketing_spend as
with cash as (select coalesce(sum(amount_pkr), 0) as cash_pkr from cash_marketing),
prg as (
  select coalesce(sum(sm.cogs_pkr_snap), 0) as pr_gift_pkr
  from stock_movements sm
  where sm.kind = 'pr_gift'   -- pr_gift movements are un-reversible (guard forbids it — Fix Group 2, 090055); cost is frozen per-movement (C3)
)
select cash.cash_pkr::numeric(14,2) as cash_pkr,
  prg.pr_gift_pkr::numeric(14,2)    as pr_gift_pkr,
  (cash.cash_pkr + prg.pr_gift_pkr)::numeric(14,2) as total_pkr
from cash cross join prg;

create or replace view corrections_loss as
with amt as (
  select coalesce(sum(amount_pkr), 0) as amount_pkr from corrections
  where action = any (array['refund'::correction_action, 'compensation'::correction_action])
),
repl as (
  select coalesce(sum(sm.cogs_pkr_snap), 0) as replacement_pkr
  from stock_movements sm
  where sm.kind = 'replacement'   -- replacement cost frozen per-movement (C3); un-reversible (090055)
)
select amt.amount_pkr::numeric(14,2) as refund_comp_pkr,
  repl.replacement_pkr::numeric(14,2) as replacement_pkr,
  (amt.amount_pkr + repl.replacement_pkr)::numeric(14,2) as total_pkr
from amt cross join repl;

-- investor_sale_accrual is RESHAPED to the lean zero-live-join form (drops the display-only
-- ingredient columns), so it and its dependent investor_owed are dropped + recreated.
drop view investor_owed;
drop view investor_sale_accrual;

create view investor_sale_accrual as
select
  sm.investor_id_snap                                        as investor_id,
  sm.id                                                      as movement_id,
  sm.order_item_id,
  sm.qty,
  sm.cogs_pkr_snap                                           as capital_pkr,
  sm.investor_share_pkr_snap                                 as investor_share_pkr,
  (sm.cogs_pkr_snap + sm.investor_share_pkr_snap)::numeric(14,2) as accrued_pkr
from stock_movements sm
where sm.kind = 'sale'::movement_kind
  and sm.owner_kind_snap = 'investor'::owner_kind;

create view investor_owed as
select
  inv.id as investor_id,
  inv.name,
  inv.active,
  coalesce(acc.accrued_pkr, 0)::numeric(14,2) as accrued_pkr,
  coalesce(pay.paid_pkr, 0)::numeric(14,2)    as paid_out_pkr,
  (coalesce(acc.accrued_pkr, 0) - coalesce(pay.paid_pkr, 0))::numeric(14,2) as owed_pkr
from investors inv
  left join (
    select investor_id, sum(accrued_pkr) as accrued_pkr
    from investor_sale_accrual group by investor_id
  ) acc on acc.investor_id = inv.id
  left join (
    select investor_id, sum(case when kind = 'payout' then amount_pkr else -amount_pkr end) as paid_pkr
    from investor_payouts group by investor_id
  ) pay on pay.investor_id = inv.id;

-- ---- 5. Audit investor_deals (split_pct is an economics field — was unaudited). -----------------
create trigger audit_investor_deals
  after insert or update or delete on investor_deals
  for each row execute function log_audit();
