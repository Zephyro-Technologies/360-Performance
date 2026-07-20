-- ===========================================================================
-- Phase 4 — Investor ownership & settlement (the money phase). Entity + the immutable
-- payout ledger. Owed-balance + the P&L carve-out are derived views (090037).
--
-- Disjoint ownership (Phase 2): a product is wholly house OR wholly one investor.
-- An investor product links to a DEAL (investor + per-deal split %); capital math is
-- SPECIFIC-IDENTIFICATION (actual per-batch cost the FIFO sale drew — read in 090037 off
-- the sale movements Phase 3 wrote), never weighted-average. Settlement = accrue on sale,
-- pay on demand (manual ledger). investors is designed generic so capital-investors could
-- attach later via a separate table — not built now.
-- ===========================================================================

create table investors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text,
  phone      text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger investors_set_updated_at before update on investors for each row execute function set_updated_at();

-- A funding arrangement: an investor at a profit split. split_pct is a FRACTION (0.5 = 50%),
-- per-deal (an investor may hold several deals at different splits). Default 50/50.
create table investor_deals (
  id          uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete restrict,
  split_pct   numeric(5,4) not null default 0.5 check (split_pct >= 0 and split_pct <= 1),
  label       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index investor_deals_investor_idx on investor_deals(investor_id);

-- The ownership link on the catalogue. A product is house (no deal) or investor (one deal).
alter table products add column investor_deal_id uuid references investor_deals(id) on delete restrict;
alter table products add constraint products_owner_deal_consistency check (
  (owner_kind = 'house'    and investor_deal_id is null)
  or (owner_kind = 'investor' and investor_deal_id is not null)
);
create index products_investor_deal_idx on products(investor_deal_id);

-- Manual, immutable payout ledger (mirrors vendor_advance_entries / payments): positive
-- amounts, corrections as reversal rows, append-only RLS (090037), balance guard below.
create type payout_kind as enum ('payout', 'reversal');
create table investor_payouts (
  id          uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete restrict,
  kind        payout_kind not null default 'payout',
  amount_pkr  numeric(14,2) not null check (amount_pkr > 0),
  paid_on     date not null default current_date,
  method      payment_method,
  reverses_id uuid references investor_payouts(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index investor_payouts_investor_idx on investor_payouts(investor_id);
-- a payout can be reversed at most once
create unique index investor_payouts_reverses_uniq on investor_payouts(reverses_id) where reverses_id is not null;
