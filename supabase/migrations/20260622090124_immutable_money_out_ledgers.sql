-- ===========================================================================
-- P1 (integrity) — make the three "money-out" ledgers immutable, matching the
-- payments / stock_movements / investor_payouts doctrine (090053): no edits, no deletes.
-- A mistake is corrected by a signed REVERSAL row (negative amount referencing the original),
-- which nets automatically through every `sum(amount_pkr)` P&L view — so NO view is touched.
--
--   refunds, cash_marketing            → insert-only ledgers (create + reverse).
--   customer_deliveries                → insert-only, plus ONE controlled lifecycle
--                                        transition (owed → paid) via mark_delivery_paid().
-- ===========================================================================

-- ---- reversal linkage (one reversal per original, enforced by a partial-unique index) -------
alter table refunds             add column reverses_id uuid references refunds(id);
alter table customer_deliveries add column reverses_id uuid references customer_deliveries(id);
alter table cash_marketing      add column reverses_id uuid references cash_marketing(id);

create unique index refunds_reverses_uq             on refunds(reverses_id)             where reverses_id is not null;
create unique index customer_deliveries_reverses_uq on customer_deliveries(reverses_id) where reverses_id is not null;
create unique index cash_marketing_reverses_uq      on cash_marketing(reverses_id)      where reverses_id is not null;

-- ---- signed-amount rule: originals keep their sign; a reversal must be strictly negative -----
alter table refunds             drop constraint refunds_amount_pkr_check;
alter table refunds             add  constraint refunds_amount_signed
  check (case when reverses_id is null then amount_pkr > 0 else amount_pkr < 0 end);
alter table customer_deliveries drop constraint customer_deliveries_amount_pkr_check;
alter table customer_deliveries add  constraint customer_deliveries_amount_signed
  check (case when reverses_id is null then amount_pkr > 0 else amount_pkr < 0 end);
alter table cash_marketing      drop constraint cash_marketing_amount_pkr_check;
alter table cash_marketing      add  constraint cash_marketing_amount_signed
  check (case when reverses_id is null then amount_pkr >= 0 else amount_pkr < 0 end);

-- ---- reversal integrity: exactly -original, real & un-reversed target, no self/chain reversal -
create or replace function guard_ledger_reversal() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_amount numeric; v_reverses uuid; v_dup int;
begin
  if new.reverses_id is null then return new; end if;
  if new.reverses_id = new.id then raise exception 'A row cannot reverse itself.'; end if;
  execute format('select amount_pkr, reverses_id from %I where id = $1', tg_table_name)
    into v_amount, v_reverses using new.reverses_id;
  if v_amount is null then raise exception 'Reversal target does not exist.'; end if;
  if v_reverses is not null then raise exception 'Cannot reverse a reversal.'; end if;
  execute format('select count(*) from %I where reverses_id = $1', tg_table_name) into v_dup using new.reverses_id;
  if v_dup > 0 then raise exception 'This entry has already been reversed.'; end if;
  if new.amount_pkr <> -v_amount then raise exception 'Reversal amount must equal the negative of the original (%).', v_amount; end if;
  return new;
end $$;

create trigger guard_refunds_reversal             before insert on refunds             for each row execute function guard_ledger_reversal();
create trigger guard_customer_deliveries_reversal before insert on customer_deliveries for each row execute function guard_ledger_reversal();
create trigger guard_cash_marketing_reversal      before insert on cash_marketing      for each row execute function guard_ledger_reversal();

-- ---- immutability: strip UPDATE/DELETE (RLS was the only backstop; these are ledgers now) ----
revoke update, delete, references, trigger on refunds, customer_deliveries, cash_marketing from authenticated;

-- ---- the one legitimate lifecycle transition: mark a delivery paid (owed → paid, once) -------
-- SECURITY DEFINER so it can UPDATE despite the revoke above; still re-checks the caller's role
-- (never trust the client) and only flips a still-owed, non-reversal row. The audit trigger logs it.
create or replace function mark_delivery_paid(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  update customer_deliveries set paid_on = current_date
    where id = p_id and paid_on is null and reverses_id is null;
  if not found then raise exception 'Delivery not found, already paid, or is a reversal.'; end if;
end $$;
revoke execute on function mark_delivery_paid(uuid) from public, anon;
grant execute on function mark_delivery_paid(uuid) to authenticated;
