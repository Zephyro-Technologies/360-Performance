-- ============================================================================
-- Fix Group 2 (H1 + H2) — Immutability backfill on the order / sale path.
--
-- The Phase-7 build_lines/payments freeze + delete-protection discipline was never retrofitted to
-- the older, more central order_items / sale-movement path. sale_margin reads order_items.price_pkr
-- LIVE and INNER-joins order_items, and stock_movements.order_item_id is ON DELETE SET NULL — so
-- once a line has DRAWN STOCK (a kind='sale' movement) an UPDATE of its price, or a DELETE of the
-- line or its order, rewrites or ERASES realized revenue / COGS / investor accrual while the stock
-- stays consumed (a paid investor's owed can even go durably NEGATIVE).
--
-- These guards PREVENT that. They touch NO view or money-path RPC body — the P&L computation is
-- unchanged (proven by the carve-out reconciliation). Mirrors build_lines_remove / builds_remove
-- (migration 090047), using the same inline NOT-EXISTS RLS pattern.
--
-- PARTIAL DELIVERY (Phase 3: e.g. 5 of 8 delivered) is respected: realized terms freeze, but the
-- undelivered remainder stays fulfillable — price locks once ANY unit ships, qty can't drop below
-- qty_delivered, yet qty_delivered may still ADVANCE (fulfil_order_line delivers the rest, running
-- as owner) and an un-drawn line stays fully editable.
-- ============================================================================

-- H1 (a) — freeze the REALIZED terms of a (partly) delivered line, without blocking fulfilment.
-- SECURITY DEFINER so it reads stock_movements in owner context regardless of the writer's role.
create or replace function freeze_drawn_order_item()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_drawn boolean := exists (select 1 from stock_movements where order_item_id = old.id and kind = 'sale');
begin
  if v_drawn then
    -- price_pkr drives realized revenue via sale_margin's live join; product_id fixes owner_kind +
    -- the investor split (sale_margin joins products via oi.product_id). BOTH are realized terms —
    -- editing either retroactively rewrites a past sale, so both are frozen once a unit ships.
    if new.price_pkr is distinct from old.price_pkr then
      raise exception 'This line has already been delivered (in part) — its price is frozen. Record an at-fault correction instead of editing realized revenue.'
        using errcode = 'check_violation';
    end if;
    if new.product_id is distinct from old.product_id then
      raise exception 'This line has already been delivered (in part) — its product is frozen (it fixes the owner / investor split of the realized sale).'
        using errcode = 'check_violation';
    end if;
    -- order_id fixes which order/customer the realized sale is attributed to — re-parenting a drawn
    -- line would move booked revenue to another order. Frozen. (Mutating the PRODUCT row's owner or
    -- the deal's split still re-owners a sale — that is finding C3, tracked separately, not here.)
    if new.order_id is distinct from old.order_id then
      raise exception 'This line has already been delivered (in part) — it cannot be moved to another order.'
        using errcode = 'check_violation';
    end if;
    -- qty_delivered is monotonic once drawn: decreasing it would let the remainder be re-drawn,
    -- fabricating a second sale of the same units. fulfil_order_line only ever INCREMENTS it.
    if new.qty_delivered < old.qty_delivered then
      raise exception 'Delivered quantity cannot be reduced on a line with realized sales — unwind through the at-fault corrections tool.'
        using errcode = 'check_violation';
    end if;
  end if;
  -- Never strand already-delivered units (belt for the qty CHECK; applies drawn or not). The
  -- forward path is unaffected — fulfil_order_line only advances qty_delivered up to qty.
  if new.qty < new.qty_delivered then
    raise exception 'Cannot reduce quantity below the % already delivered on this line.', new.qty_delivered
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger freeze_drawn_order_item
  before update on order_items
  for each row execute function freeze_drawn_order_item();

-- H1 (b) — audit order_items (it had NO audit trigger; reuse the generic log_audit, which already
-- guards orders/payments/invoices/etc. and skips service-role/seed writes via auth.uid()).
create trigger audit_order_items
  after insert or update or delete on order_items
  for each row execute function log_audit();

-- H1 (c) — a drawn line cannot be DELETED (deleting it SET-NULLs its sale movements → the sale
-- drops out of sale_margin). Split the old FOR ALL write policy so DELETE can carry the guard;
-- INSERT/UPDATE keep the staff/admin rule (the freeze trigger enforces the column-level lock).
drop policy if exists order_items_write on order_items;
create policy order_items_ins on order_items for insert to authenticated
  with check (has_role(array['admin', 'staff']::user_role[]));
create policy order_items_upd on order_items for update to authenticated
  using      (has_role(array['admin', 'staff']::user_role[]))
  with check (has_role(array['admin', 'staff']::user_role[]));
create policy order_items_del on order_items for delete to authenticated
  using (has_role(array['admin', 'staff']::user_role[])
         and not exists (select 1 from stock_movements sm
                         where sm.order_item_id = order_items.id and sm.kind = 'sale'));

-- H2 — an order with any delivered line cannot be DELETED (the cascade would orphan every sale
-- movement → drop the sales from sale_margin / investor accrual; a paid investor's owed goes
-- durably NEGATIVE). Soft-cancel via stage='cancelled' (already supported, already in the Kanban)
-- preserves realized revenue / COGS / accrual. Mirror of builds_remove. A bare order (no sales)
-- is still hard-deletable.
drop policy if exists orders_del on orders;
create policy orders_del on orders for delete to authenticated
  using (has_role(array['admin']::user_role[])
         and not exists (select 1 from order_items oi
                         join stock_movements sm on sm.order_item_id = oi.id
                         where oi.order_id = orders.id and sm.kind = 'sale'));
