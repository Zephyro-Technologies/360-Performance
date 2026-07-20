-- ===========================================================================
-- Phase 2 — the purchasing / inventory core.
--   purchase_orders   — a purchase event (PO-1001…), client-entered frozen RMB rate
--   purchase_order_lines — product/qty/costs + the per-item payables (item/ship paid)
--   batches           — created on receipt; IMMUTABLE actual per-unit landed cost
--                       (the source of truth — weighted-average is derived in 090032)
--   stock_movements   — immutable append-only ledger; stock = Σ signed movements.
--                       Mirrors the payments / vendor-advance ledger discipline.
-- receive_po_line() is the server-authoritative receive (freezes landed cost, makes
-- the batch, posts the `receive` movement). PO numbering uses 'PO-' (customer orders
-- already use 'ORD-').
-- ===========================================================================

create type po_status     as enum ('planning','approved','ordered','in_production','in_transit','received','cancelled');
create type movement_kind as enum ('receive','sale','pr_gift','replacement','adjust_add','adjust_remove','reversal');

create sequence po_no_seq start 1001;
create or replace function assign_po_no() returns trigger language plpgsql as $$
begin
  if new.po_no is null then new.po_no := 'PO-' || nextval('po_no_seq'); end if;
  return new;
end $$;

-- ---- purchase orders ------------------------------------------------------
create table purchase_orders (
  id                 uuid primary key default gen_random_uuid(),
  po_no              text unique,
  supplier_id        uuid not null references suppliers(id) on delete restrict,
  status             po_status not null default 'planning',
  -- the client gets the RMB->PKR rate from the vendor per purchase and types it here;
  -- PKR per 1 RMB, frozen for this PO's costing. NULL until entered.
  frozen_rate_rmb_pkr numeric(14,6) check (frozen_rate_rmb_pkr is null or frozen_rate_rmb_pkr > 0),
  ordered_on         date,
  expected_on        date,
  received_on        date,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index purchase_orders_supplier_idx on purchase_orders(supplier_id);
create trigger purchase_orders_assign_no    before insert on purchase_orders for each row execute function assign_po_no();
create trigger purchase_orders_set_updated_at before update on purchase_orders for each row execute function set_updated_at();

-- ---- purchase order lines (+ per-item payables) ---------------------------
create table purchase_order_lines (
  id                     uuid primary key default gen_random_uuid(),
  purchase_order_id      uuid not null references purchase_orders(id) on delete cascade,
  product_id             uuid not null references products(id) on delete restrict,
  qty_ordered            int  not null check (qty_ordered > 0),
  unit_cost_rmb          numeric(14,2) not null check (unit_cost_rmb >= 0),
  shipping_per_unit_pkr  numeric(12,2) not null default 0 check (shipping_per_unit_pkr  >= 0),
  packaging_per_unit_pkr numeric(12,2) not null default 0 check (packaging_per_unit_pkr >= 0),
  -- payables: cash actually paid (PKR), distinct from the RMB×rate cost basis above
  item_paid_amount_pkr   numeric(12,2) check (item_paid_amount_pkr is null or item_paid_amount_pkr >= 0),
  item_paid_on           date,
  ship_paid_amount_pkr   numeric(12,2) check (ship_paid_amount_pkr is null or ship_paid_amount_pkr >= 0),
  ship_paid_on           date,
  qty_received           int not null default 0 check (qty_received >= 0 and qty_received <= qty_ordered),
  created_at             timestamptz not null default now()
);
create index po_lines_po_idx      on purchase_order_lines(purchase_order_id);
create index po_lines_product_idx on purchase_order_lines(product_id);

-- A received line is locked: product/qty/costs frozen (the batch cost is already frozen
-- independently). Receiving + marking payables paid are still allowed.
create or replace function guard_po_line_locked() returns trigger language plpgsql as $$
begin
  if old.qty_received > 0 and (
       new.product_id             is distinct from old.product_id
    or new.qty_ordered            is distinct from old.qty_ordered
    or new.unit_cost_rmb          is distinct from old.unit_cost_rmb
    or new.shipping_per_unit_pkr  is distinct from old.shipping_per_unit_pkr
    or new.packaging_per_unit_pkr is distinct from old.packaging_per_unit_pkr) then
    raise exception 'This line has been received; its product, quantity and costs are locked.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger po_lines_locked before update on purchase_order_lines for each row execute function guard_po_line_locked();

-- ---- batches (the atomic cost + stock unit) -------------------------------
create table batches (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id) on delete restrict,
  source_po_line_id uuid not null references purchase_order_lines(id) on delete restrict,
  qty_received      int  not null check (qty_received > 0),       -- immutable
  landed_cost_pkr   numeric(12,2) not null check (landed_cost_pkr >= 0), -- IMMUTABLE source of truth
  received_on       date not null default current_date,
  created_at        timestamptz not null default now()
);
create index batches_product_idx on batches(product_id);
create index batches_po_line_idx on batches(source_po_line_id);

-- ---- stock movements (immutable append-only ledger) -----------------------
-- positive qty; the KIND fixes the direction (receive/adjust_add +, sale/pr_gift/
-- replacement/adjust_remove -); a `reversal` references a prior movement and takes the
-- OPPOSITE direction. on-hand(batch) = Σ signed; on-hand(product) = Σ over its batches.
create table stock_movements (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references batches(id) on delete restrict,
  kind        movement_kind not null,
  qty         int not null check (qty > 0),
  reverses_id uuid references stock_movements(id),
  reference   text,                       -- free-form: PR recipient, reason, order ref (Phase 3 adds the link)
  occurred_on date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index stock_movements_batch_idx on stock_movements(batch_id);
create unique index stock_movements_one_receive  on stock_movements(batch_id)    where kind = 'receive';
create unique index stock_movements_reverses_uniq on stock_movements(reverses_id) where reverses_id is not null;

-- Guard: reversal integrity (references a real, same-batch, equal-qty, not-already-reversed
-- movement) + a batch's on-hand can never go below zero.
create or replace function guard_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ref_kind  movement_kind;
  v_ref_qty   int;
  v_ref_batch uuid;
  v_ref_rev   uuid;
  v_delta     int;
  v_remaining int;
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
create trigger stock_movements_guard before insert on stock_movements for each row execute function guard_stock_movement();

-- ---- receive RPC (server-authoritative) -----------------------------------
-- Freezes landed cost = unit_cost_rmb × PO.frozen_rate + shipping/unit + packaging/unit,
-- creates the batch, posts the `receive` movement, advances qty_received, and flips the
-- PO to 'received' once every line is fully in. Supports partial receipt (one batch per call).
create or replace function receive_po_line(p_line_id uuid, p_qty int, p_received_on date default current_date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_line   purchase_order_lines%rowtype;
  v_po     purchase_orders%rowtype;
  v_landed numeric(12,2);
  v_batch  uuid;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to receive stock.' using errcode = 'check_violation';
  end if;
  select * into v_line from purchase_order_lines where id = p_line_id;
  if v_line.id is null then raise exception 'Purchase-order line not found.' using errcode = 'check_violation'; end if;
  select * into v_po from purchase_orders where id = v_line.purchase_order_id;
  if v_po.status = 'cancelled' then raise exception 'Cannot receive a cancelled purchase order.' using errcode = 'check_violation'; end if;
  if v_po.frozen_rate_rmb_pkr is null then raise exception 'Set the PO RMB->PKR rate before receiving.' using errcode = 'check_violation'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Receive quantity must be positive.' using errcode = 'check_violation'; end if;
  if p_qty > (v_line.qty_ordered - v_line.qty_received) then
    raise exception 'Cannot receive more than the % outstanding on this line.', (v_line.qty_ordered - v_line.qty_received) using errcode = 'check_violation';
  end if;

  v_landed := round(v_line.unit_cost_rmb * v_po.frozen_rate_rmb_pkr
                    + v_line.shipping_per_unit_pkr + v_line.packaging_per_unit_pkr, 2);

  insert into batches (product_id, source_po_line_id, qty_received, landed_cost_pkr, received_on)
    values (v_line.product_id, p_line_id, p_qty, v_landed, p_received_on)
    returning id into v_batch;
  insert into stock_movements (batch_id, kind, qty, occurred_on, note)
    values (v_batch, 'receive', p_qty, p_received_on, 'PO receipt');
  update purchase_order_lines set qty_received = qty_received + p_qty where id = p_line_id;

  if not exists (select 1 from purchase_order_lines
                 where purchase_order_id = v_po.id and qty_received < qty_ordered) then
    update purchase_orders set status = 'received', received_on = coalesce(received_on, p_received_on)
      where id = v_po.id;
  end if;
  return v_batch;
end $$;
