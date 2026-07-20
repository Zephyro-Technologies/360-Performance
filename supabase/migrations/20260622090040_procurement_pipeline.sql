-- ===========================================================================
-- Phase 6 — Procurement pipeline (the "Future Orders" wishlist). The FRONT of the
-- funnel, upstream of purchase orders: items the client is researching / has quotes for /
-- plans to buy, with a priority. A planned purchase tolerates a FREE-TEXT item (researched
-- before it's a catalogue product) — which is exactly why this is a separate entity and not
-- an early PO stage (a PO line's product_id is NOT NULL, and a PO burns a number on insert).
--
-- GRADUATION: once it has a catalogue product + a vendor, graduate_planned_purchase() makes a
-- real PO + line (Phase 2 machinery) and marks the plan 'ordered'. Internal procurement data.
-- ===========================================================================

create type plan_priority as enum ('high', 'medium', 'low');
create type plan_status   as enum ('researching', 'quoted', 'planning', 'approved', 'ordered', 'dropped');

create table planned_purchases (
  id                 uuid primary key default gen_random_uuid(),
  item_name          text not null,                                       -- free-text label (or the product's name)
  product_id         uuid references products(id)  on delete set null,    -- linked once it's a catalogue product (req. to graduate)
  supplier_id        uuid references suppliers(id) on delete set null,    -- intended vendor (req. to graduate)
  planned_qty        int           check (planned_qty is null or planned_qty > 0),
  est_unit_cost_pkr  numeric(12,2) check (est_unit_cost_pkr is null or est_unit_cost_pkr >= 0),  -- planning estimate (PKR), reference only
  target_retail_pkr  numeric(12,2) check (target_retail_pkr is null or target_retail_pkr >= 0),
  priority           plan_priority not null default 'medium',
  status             plan_status   not null default 'researching',
  notes              text,
  graduated_to_po_id uuid references purchase_orders(id) on delete set null,  -- the PO it became
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index planned_purchases_status_idx   on planned_purchases(status);
create index planned_purchases_priority_idx on planned_purchases(priority);
create trigger planned_purchases_set_updated_at before update on planned_purchases for each row execute function set_updated_at();

-- Graduate an approved/planned item into a real purchase order + line. Requires a linked
-- catalogue product (the line needs it) and a vendor (the PO needs it). The PO starts
-- 'ordered'; the operator fills the real RMB cost + frozen rate before receiving.
create or replace function graduate_planned_purchase(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pp planned_purchases%rowtype;
  v_po uuid;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to graduate a planned purchase.' using errcode = 'check_violation';
  end if;
  select * into v_pp from planned_purchases where id = p_id;
  if v_pp.id is null then raise exception 'Planned purchase not found.' using errcode = 'check_violation'; end if;
  if v_pp.graduated_to_po_id is not null or v_pp.status in ('ordered','dropped') then
    raise exception 'This planned purchase has already been graduated or dropped.' using errcode = 'check_violation';
  end if;
  if v_pp.product_id is null then
    raise exception 'Link a catalogue product before graduating (the PO line needs one).' using errcode = 'check_violation';
  end if;
  if v_pp.supplier_id is null then
    raise exception 'Set the intended vendor before graduating (the PO needs one).' using errcode = 'check_violation';
  end if;

  insert into purchase_orders (supplier_id, status)
    values (v_pp.supplier_id, 'ordered')
    returning id into v_po;
  insert into purchase_order_lines (purchase_order_id, product_id, qty_ordered, unit_cost_rmb)
    values (v_po, v_pp.product_id, coalesce(v_pp.planned_qty, 1), 0);
  update planned_purchases set status = 'ordered', graduated_to_po_id = v_po where id = p_id;

  return v_po;
end $$;

-- ---- RLS + grants + anon-hardening ----------------------------------------
alter table planned_purchases enable row level security;
grant select, insert, update, delete on planned_purchases to authenticated;
grant execute on function graduate_planned_purchase(uuid) to authenticated;

create policy planned_read  on planned_purchases for select to authenticated using (has_role(array['admin','staff','viewer']::user_role[]));
create policy planned_write on planned_purchases for all    to authenticated using (has_role(array['admin','staff']::user_role[])) with check (has_role(array['admin','staff']::user_role[]));

revoke all on planned_purchases from anon;
