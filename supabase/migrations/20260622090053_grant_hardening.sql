-- ===========================================================================
-- Fix Group 1 — C1 + M5: GRANT HARDENING. Revokes only — NO business logic, no view or RPC
-- body is touched, so the accounting is provably unaffected.
--
-- C1 (CRITICAL, unauthenticated): Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every
-- public function to anon (and authenticated). Earlier migrations only did `revoke … from public`,
-- which never strips the EXPLICIT anon grant — so anon could POST /rest/v1/rpc/draw_stock_fifo and
-- mutate the append-only stock ledger (proven). 090016 fixed the TABLES default but never FUNCTIONS.
--
-- M5 (latent total-wipe): authenticated held ALL (incl. TRUNCATE, which BYPASSES RLS) on every
-- table — a one-statement wipe of the immutable ledgers with RLS as no defence.
-- ===========================================================================

-- ---- C1 (a): shrink the FUNCTIONS default going forward (best-effort) -------------------------
-- This strips Supabase's explicit anon default grant. NOTE (verified empirically): Postgres always
-- re-applies its BUILT-IN PUBLIC=EXECUTE to newly-created functions, and ALTER DEFAULT PRIVILEGES
-- does NOT suppress that — so this line alone does NOT make future functions anon-safe. The hard
-- guarantees are: (b) below, which explicitly revokes every EXISTING function from anon+public; the
-- CONVENTION that every new internal RPC must `revoke execute … from anon, public` in its own
-- migration (app RPCs stay granted to authenticated); and the rls-tests assertion "anon cannot
-- execute internal RPCs", which fails CI if any future function leaks to anon. Kept as belt.
do $$
begin
  alter default privileges in schema public revoke execute on functions from public, anon;
exception when others then raise warning 'default-priv (functions/public+anon) not altered: %', sqlerrm;
end $$;

-- ---- C1 (b): revoke EXECUTE from anon on EVERY existing non-extension function ----------------
-- Removes the explicit anon grant AND the inherited PUBLIC grant. Extension helpers (citext/regexp/
-- text ops) are skipped — they are pure and anon needs them for citext column queries. Trigger
-- functions and the internal draw_stock_fifo primitive additionally lose `authenticated`: triggers
-- run in the table-owner context (no caller EXECUTE needed) and draw_stock_fifo is only ever called
-- by the SECURITY DEFINER wrappers (fulfil_order_line / gift_pr / record_correction), which run as
-- owner. The app RPCs and has_role KEEP their authenticated grant.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig,
           (p.prorettype = 'pg_catalog.trigger'::regtype) as is_trigger,
           p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    if r.is_trigger or r.proname = 'draw_stock_fifo' then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;

-- has_role is called inside every RLS policy, so authenticated MUST retain EXECUTE.
-- The loop above revokes it from public; unlike the app RPCs it never had an explicit
-- authenticated grant to fall back on, so re-grant it here (matches this migration's intent).
grant execute on function has_role(user_role[]) to authenticated;

-- ---- M5: TRUNCATE bypasses RLS — strip it from app roles everywhere (no app path truncates); ---
-- ---- and remove the append-only ledgers' UPDATE/DELETE grants, where RLS was the only backstop. -
revoke truncate on all tables in schema public from anon, authenticated;
do $$
begin
  alter default privileges in schema public revoke truncate on tables from anon, authenticated;
exception when others then raise warning 'default-priv (tables/truncate) not altered: %', sqlerrm;
end $$;

revoke update, delete, references, trigger on
  payments, stock_movements, investor_payouts, vendor_advance_entries, corrections,
  audit_log, order_stage_events
from authenticated;
