-- ===========================================================================
-- Phase 10 (Part A) — add the operating-expense categories the client tracks. The expenses
-- ledger is opex-only (salaries/rent/subscriptions/operations/other); inventory + shipping are
-- COGS via the batch/PO system, NOT expenses. Standalone migration: Postgres forbids using a
-- newly-added enum value in the same transaction that adds it, so the pnl_summary widen + the
-- opex CHECK (which reference these values) live in the next migration.
-- ===========================================================================
alter type expense_category add value if not exists 'rent';
alter type expense_category add value if not exists 'subscriptions';
alter type expense_category add value if not exists 'other';
