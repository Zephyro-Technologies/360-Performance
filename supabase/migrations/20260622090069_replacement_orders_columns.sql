-- ===========================================================================
-- Replacement orders (deferred at-fault re-ship).
--
-- Before: an at-fault REPLACEMENT drew house stock immediately and left no trace in the
-- pipeline — the physical re-delivery was untracked. Now a replacement spins up a NEW order
-- (see record_correction, migration 090070) that runs through the pipeline from 'received',
-- and the house loss is DEFERRED to that order's delivery (drawn as a 'replacement' movement
-- in fulfil_order_line) instead of at correction time.
--
-- This migration only adds the links; the behaviour change is in 090070.
--   * orders.replaces_order_id      → the original order this replacement re-ships for.
--   * corrections.replacement_order_id → the pipeline order a replacement correction spawned.
-- ===========================================================================
alter table orders add column replaces_order_id uuid references orders(id) on delete set null;
create index orders_replaces_idx on orders(replaces_order_id);

alter table corrections add column replacement_order_id uuid references orders(id) on delete set null;
create index corrections_replacement_order_idx on corrections(replacement_order_id);
