-- ===========================================================================
-- Phase 8 — Marketing: PR gifts (inventory given away) + cash marketing. Both feed the
-- marketing line "What you kept" already subtracts (Phase 4). A PR gift is a stock-out that
-- costs MARKETING (the landed cost of the gifted units), never COGS — there's no sale.
--   * pr_gifts: the PR log. cash_marketing: the cash ledger.
--   * pr_gift movements REUSE draw_stock_fifo (generalized to take the kind + the gift link).
--   * LOCKED: PR gifts use HOUSE stock only — guarded at the DB level in guard_stock_movement.
-- ===========================================================================

create type marketing_type as enum ('sponsorship', 'paid_promo', 'discount', 'other');
create type pr_status      as enum ('sent', 'posted', 'converted', 'no_result');

-- Cash marketing ledger (no inventory): sponsorships, paid promos, discounts.
create table cash_marketing (
  id         uuid primary key default gen_random_uuid(),
  kind       marketing_type not null default 'paid_promo',
  amount_pkr numeric(12,2) not null check (amount_pkr >= 0),
  recipient  text,
  note       text,
  spent_on   date not null default current_date,
  created_at timestamptz not null default now()
);

-- PR log: one row per PR gift. Landed cost is DERIVED from the linked pr_gift movements.
create table pr_gifts (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete restrict,
  qty            int  not null check (qty > 0),
  recipient      text,
  platform       text,
  content_type   text,                                  -- free text: reel/story/post/YouTube/…
  expected_reach int check (expected_reach is null or expected_reach >= 0),
  status         pr_status not null default 'sent',
  notes          text,
  occurred_on    date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index pr_gifts_product_idx on pr_gifts(product_id);
create trigger pr_gifts_set_updated_at before update on pr_gifts for each row execute function set_updated_at();

-- a pr_gift stock movement links to its PR log row (like a sale links to its order line)
alter table stock_movements add column pr_gift_id uuid references pr_gifts(id) on delete set null;
create index stock_movements_pr_gift_idx on stock_movements(pr_gift_id);

-- ---- generalize draw_stock_fifo: kind + the sale/gift link are now parameters ------------
drop function draw_stock_fifo(uuid, int, uuid, date);
create or replace function draw_stock_fifo(
  p_product_id uuid, p_qty int, p_kind movement_kind,
  p_order_item_id uuid, p_pr_gift_id uuid, p_occurred_on date, p_note text
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
    insert into stock_movements (batch_id, kind, qty, order_item_id, pr_gift_id, occurred_on, note)
      values (b.batch_id, p_kind, v_take, p_order_item_id, p_pr_gift_id, p_occurred_on, p_note);
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then
    raise exception 'Stock allocation failed (% units short).', v_need using errcode = 'check_violation';
  end if;
end $$;
revoke execute on function draw_stock_fifo(uuid, int, movement_kind, uuid, uuid, date, text) from public;  -- internal-only

-- fulfil_order_line: same logic, new draw_stock_fifo signature (sale, no pr_gift link).
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

  perform draw_stock_fifo(v_line.product_id, p_qty, 'sale'::movement_kind, p_line_id, null, current_date, 'order delivery');

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

-- guard_stock_movement: + the LOCKED rule that PR gifts can only draw HOUSE stock.
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

  -- LOCKED: PR gifts use house stock only — never an investor's capital.
  if new.kind = 'pr_gift' then
    select p.owner_kind into v_owner from batches ba join products p on p.id = ba.product_id where ba.id = new.batch_id;
    if v_owner is distinct from 'house' then
      raise exception 'PR gifts can only use house stock, not investor stock.' using errcode = 'check_violation';
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

-- gift_pr: record a PR gift — house stock only — and draw it FIFO at landed cost.
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
  perform draw_stock_fifo(p_product_id, p_qty, 'pr_gift'::movement_kind, null, v_pr, coalesce(p_occurred_on, current_date), 'PR gift');
  return v_pr;
end $$;

-- ---- RLS + grants + anon-hardening ----------------------------------------
alter table cash_marketing enable row level security;
alter table pr_gifts       enable row level security;

grant select, insert, update, delete on cash_marketing, pr_gifts to authenticated;
grant execute on function gift_pr(uuid, int, text, text, text, int, pr_status, text, date) to authenticated;

create policy cashmkt_read  on cash_marketing for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy cashmkt_write on cash_marketing for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));
create policy prgift_read   on pr_gifts       for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy prgift_write  on pr_gifts       for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

revoke all on cash_marketing, pr_gifts from anon;
