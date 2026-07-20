-- ===========================================================================
-- Lock a PO's RMB->PKR rate once any of its lines has been received.
--
-- guard_po_line_locked (090031) freezes a received LINE's product/qty/costs, and the batch's
-- landed_cost_pkr is frozen independently at receipt. But nothing locked the PO-level
-- frozen_rate_rmb_pkr, and the UI exposed it at every status including `received`.
--
-- That was a hole, because the payables side recomputes from the LIVE rate while COGS does not:
--   vendor_payables (090078)      -> round(qty_ordered * unit_cost_rmb * frozen_rate)
--   purchase_order_lines_costed   -> same
--   purchase_line_detail (090096) -> same
--   batches.landed_cost_pkr       -> frozen at receipt, never recomputed
--
-- So editing the rate on a settled, received PO silently rewrote history in both directions:
--   rate 40 -> 38 on a fully-paid 200,000 PO: item_owed goes to 0 via greatest(...,0) and the
--     detail page clamps paid to min(paid, cost) = 190,000 — 10,000 of real cash disappears
--     from "paid" without being banked as vendor credit.
--   rate 40 -> 42: a 10,000 payable is invented on a PO that was fully settled.
-- Either way purchase_line_detail.landed_cost_per_unit_pkr diverges permanently from
-- batches.landed_cost_pkr, which is the COGS source of truth — so the catalogue's acquisition
-- cost and the investor P&L stop agreeing.
--
-- The rate stays freely editable until the first receipt (it is required before receiving at
-- all — 090031:186), which is when it stops being an estimate and starts being the basis of
-- frozen batch costs. Correcting a rate after receipt is a reconciliation job for the
-- corrections ledger, not an in-place edit.
-- ===========================================================================

create or replace function guard_po_rate_locked() returns trigger language plpgsql
set search_path = public as $$
begin
  if new.frozen_rate_rmb_pkr is distinct from old.frozen_rate_rmb_pkr
     and exists (select 1 from purchase_order_lines l
                 where l.purchase_order_id = old.id and l.qty_received > 0) then
    raise exception 'Stock has been received against this PO; its RMB rate is locked.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger purchase_orders_rate_locked
  before update on purchase_orders
  for each row execute function guard_po_rate_locked();

comment on function guard_po_rate_locked() is
  'Freezes purchase_orders.frozen_rate_rmb_pkr once any line is received — the rate is the basis of already-frozen batch costs.';
