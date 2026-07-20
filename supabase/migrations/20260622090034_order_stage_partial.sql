-- ===========================================================================
-- Phase 3 — add the derived partial-delivery rollup value to order_stage. Additive:
-- the 7 operator stages stay (the kanban still drives received -> processing -> ...);
-- per-line delivery drives `delivered` / `partially_delivered` (set by fulfil_order_line,
-- no longer a manual click). Separate migration so the value is committed before use.
-- ===========================================================================
alter type order_stage add value if not exists 'partially_delivered';
