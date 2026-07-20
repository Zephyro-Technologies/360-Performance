-- ===========================================================================
-- Phase 9 — At-Fault Corrections. A SMALL internal admin tool (NOT a returns/RMA subsystem):
-- when 360 is at fault, an admin records how it was made right. The ORIGINAL sale is NEVER
-- reversed (sale_margin untouched → the Phase 4 investor carve-out stays literally untouched);
-- each correction is an ADDITIVE house loss.
--   * corrections: an append-only, RPC-only, immutable ledger (like payments/investor_payouts).
--   * REPLACEMENT re-ships free via draw_stock_fifo(kind='replacement') — HOUSE-STOCK-ONLY
--     (guarded here), so it never consumes an investor's capital. Investor at-fault items are
--     handled by refund/compensation instead.
-- This file: the ledger + enums + numbering + RLS, the stock_movements.correction_id link,
-- the widened draw_stock_fifo, and the replacement house-lock. The RPC (090049) and P&L (090050)
-- follow.
-- ===========================================================================

create type correction_action      as enum ('replacement', 'refund', 'compensation');
create type wrong_unit_disposition as enum ('written_off', 'restocked', 'na');

create sequence correction_no_seq start 1001;
create or replace function assign_correction_no() returns trigger language plpgsql as $$
begin
  if new.correction_no is null then new.correction_no := 'CORR-' || nextval('correction_no_seq'); end if;
  return new;
end $$;

create table corrections (
  id                     uuid primary key default gen_random_uuid(),
  correction_no          text unique,
  order_id               uuid not null references orders(id) on delete restrict,
  order_item_id          uuid references order_items(id) on delete set null,   -- the at-fault line
  action                 correction_action not null,
  amount_pkr             numeric(12,2),                                        -- refund/comp money; NULL for replacement
  product_id             uuid references products(id) on delete set null,      -- replacement re-ship
  qty                    int,                                                  -- replacement qty
  wrong_unit_disposition wrong_unit_disposition,
  reason                 text not null,
  notes                  text,
  created_at             timestamptz not null default now(),
  -- amount is NULL iff replacement (its loss comes from the movement); positive for refund/comp.
  -- Keeps the two loss sources (replacement landed cost vs stored amount) strictly disjoint.
  constraint corrections_amount_shape check (
    (action = 'replacement' and amount_pkr is null)
    or (action in ('refund', 'compensation') and amount_pkr is not null and amount_pkr > 0)
  ),
  constraint corrections_replacement_shape check (
    action <> 'replacement' or (product_id is not null and qty is not null and qty > 0)
  )
);
create index corrections_order_idx on corrections(order_id);
create trigger corrections_assign_no before insert on corrections for each row execute function assign_correction_no();

-- a stock movement can belong to a correction (the replacement re-ship), like order_item_id / pr_gift_id
alter table stock_movements add column correction_id uuid references corrections(id) on delete set null;
create index stock_movements_correction_idx on stock_movements(correction_id);

-- ---- widen draw_stock_fifo with the correction link (mirrors the Phase 8 pr_gift widening) ----
drop function draw_stock_fifo(uuid, int, movement_kind, uuid, uuid, date, text);
create or replace function draw_stock_fifo(
  p_product_id uuid, p_qty int, p_kind movement_kind,
  p_order_item_id uuid, p_pr_gift_id uuid, p_correction_id uuid, p_occurred_on date, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_need  int := p_qty;
  v_avail int;
  v_take  int;
  b       record;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be positive.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(remaining), 0) into v_avail from batch_on_hand where product_id = p_product_id;
  if v_avail < p_qty then
    raise exception 'Not enough stock: % on hand, % requested.', v_avail, p_qty using errcode = 'check_violation';
  end if;
  for b in
    select boh.batch_id, boh.remaining
    from batch_on_hand boh
    join batches ba on ba.id = boh.batch_id
    where boh.product_id = p_product_id and boh.remaining > 0
    order by ba.received_on asc, ba.created_at asc, ba.id asc   -- FIFO: oldest first
  loop
    exit when v_need <= 0;
    v_take := least(b.remaining, v_need);
    insert into stock_movements (batch_id, kind, qty, order_item_id, pr_gift_id, correction_id, occurred_on, note)
      values (b.batch_id, p_kind, v_take, p_order_item_id, p_pr_gift_id, p_correction_id, p_occurred_on, p_note);
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then
    raise exception 'Stock allocation failed (% units short).', v_need using errcode = 'check_violation';
  end if;
end $$;
revoke execute on function draw_stock_fifo(uuid, int, movement_kind, uuid, uuid, uuid, date, text) from public;

-- callers updated to the new 8-arg signature (extra correction link = null for sale/gift)
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
  if v_line.product_id is null then
    raise exception 'This line has no linked product to draw stock from.' using errcode = 'check_violation';
  end if;
  v_remaining := v_line.qty - v_line.qty_delivered;
  if p_qty is null or p_qty <= 0 then raise exception 'Delivery quantity must be positive.' using errcode = 'check_violation'; end if;
  if p_qty > v_remaining then
    raise exception 'Only % left to deliver on this line.', v_remaining using errcode = 'check_violation';
  end if;

  perform draw_stock_fifo(v_line.product_id, p_qty, 'sale'::movement_kind, p_line_id, null, null, current_date, 'order delivery');

  update order_items set qty_delivered = qty_delivered + p_qty where id = p_line_id;

  select bool_and(qty_delivered >= qty), bool_or(qty_delivered > 0)
    into v_all_delivered, v_any_delivered
    from order_items where order_id = v_line.order_id;
  select stage into v_stage from orders where id = v_line.order_id;
  if v_stage <> 'cancelled' then
    if v_all_delivered and v_stage is distinct from 'delivered' then
      update orders set stage = 'delivered' where id = v_line.order_id;
    elsif v_any_delivered and not v_all_delivered and v_stage is distinct from 'partially_delivered' then
      update orders set stage = 'partially_delivered' where id = v_line.order_id;
    end if;
  end if;
end $$;

create or replace function gift_pr(
  p_product_id uuid, p_qty int, p_recipient text, p_platform text, p_content_type text,
  p_expected_reach int, p_status pr_status, p_notes text, p_occurred_on date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_owner owner_kind;
  v_pr    uuid;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to record PR gifts.' using errcode = 'check_violation';
  end if;
  select owner_kind into v_owner from products where id = p_product_id;
  if v_owner is null then raise exception 'Product not found.' using errcode = 'check_violation'; end if;
  if v_owner <> 'house' then
    raise exception 'PR gifts can only use house stock, not investor stock.' using errcode = 'check_violation';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Gift quantity must be positive.' using errcode = 'check_violation'; end if;

  insert into pr_gifts (product_id, qty, recipient, platform, content_type, expected_reach, status, notes, occurred_on)
    values (p_product_id, p_qty, p_recipient, p_platform, p_content_type, p_expected_reach, coalesce(p_status, 'sent'), p_notes, coalesce(p_occurred_on, current_date))
    returning id into v_pr;
  perform draw_stock_fifo(p_product_id, p_qty, 'pr_gift'::movement_kind, null, v_pr, null, coalesce(p_occurred_on, current_date), 'PR gift');
  return v_pr;
end $$;

-- guard: PR gifts AND at-fault replacements may only draw HOUSE stock (never an investor's capital).
create or replace function guard_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ref_kind  movement_kind;
  v_ref_qty   int;
  v_ref_batch uuid;
  v_ref_rev   uuid;
  v_delta     int;
  v_remaining int;
  v_owner     owner_kind;
begin
  if new.kind = 'reversal' then
    if new.reverses_id is null then
      raise exception 'A reversal must reference the movement it corrects.' using errcode = 'check_violation';
    end if;
    select kind, qty, batch_id, reverses_id into v_ref_kind, v_ref_qty, v_ref_batch, v_ref_rev
      from stock_movements where id = new.reverses_id;
    if v_ref_kind is null then
      raise exception 'The movement being reversed was not found.' using errcode = 'check_violation';
    end if;
    if v_ref_batch <> new.batch_id then
      raise exception 'A reversal must be on the same batch.' using errcode = 'check_violation';
    end if;
    if new.qty <> v_ref_qty then
      raise exception 'A reversal must match the quantity of the movement it corrects.' using errcode = 'check_violation';
    end if;
    if v_ref_kind = 'reversal' or v_ref_rev is not null then
      raise exception 'You cannot reverse a reversal.' using errcode = 'check_violation';
    end if;
  elsif new.reverses_id is not null then
    raise exception 'Only a reversal may reference another movement.' using errcode = 'check_violation';
  end if;

  -- LOCKED: PR gifts + at-fault replacements use house stock only — never an investor's capital.
  if new.kind in ('pr_gift', 'replacement') then
    select p.owner_kind into v_owner from batches ba join products p on p.id = ba.product_id where ba.id = new.batch_id;
    if v_owner is distinct from 'house' then
      raise exception '% can only use house stock, not investor stock.',
        case when new.kind = 'pr_gift' then 'PR gifts' else 'At-fault replacements' end using errcode = 'check_violation';
    end if;
  end if;

  v_delta := case
    when new.kind = 'reversal'                then case when v_ref_kind in ('receive','adjust_add') then -new.qty else new.qty end
    when new.kind in ('receive','adjust_add') then new.qty
    else -new.qty end;

  select coalesce(sum(case
    when m.kind = 'reversal'                then case when t.kind in ('receive','adjust_add') then -m.qty else m.qty end
    when m.kind in ('receive','adjust_add') then m.qty
    else -m.qty end), 0)
  into v_remaining
  from stock_movements m left join stock_movements t on t.id = m.reverses_id
  where m.batch_id = new.batch_id;

  if v_remaining + v_delta < 0 then
    raise exception 'This movement would drive batch stock below zero.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---- RLS: corrections are RPC-only (record_correction, SECURITY DEFINER) + immutable ----------
alter table corrections enable row level security;
grant select on corrections to authenticated;   -- inserts go through the RPC only; no update/delete for anyone
create policy corrections_read on corrections for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
revoke all on corrections from anon;
