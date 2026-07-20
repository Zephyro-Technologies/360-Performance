-- ===========================================================================
-- Custom Builds — a per-part workflow STAGE, shown as a manual dropdown on BOTH parts tables
-- (stock + one-off), using the order-pipeline vocabulary. This is a workflow LABEL only: it does
-- not move money or stock (those stay on the existing Deliver / Ship paths). Same field, same
-- dropdown, both tables — that's the consistency the user asked for.
-- ===========================================================================

create type build_stage as enum ('received', 'sourcing', 'ready_to_ship', 'shipped', 'partially_delivered', 'delivered');

alter table build_lines  add column build_stage build_stage not null default 'sourcing';
alter table order_items  add column build_stage build_stage;   -- nullable: only a build's catalogue lines use it

-- Set a part's workflow stage. One writer, staff/admin-gated; bypasses the order_items update-freeze
-- (which only guards the priced/fulfilment columns) since this touches build_stage alone.
create or replace function set_build_part_stage(p_id uuid, p_catalogue boolean, p_stage build_stage)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'You do not have permission to edit builds.' using errcode = 'check_violation';
  end if;
  if p_catalogue then
    update order_items set build_stage = p_stage where id = p_id;
  else
    update build_lines set build_stage = p_stage where id = p_id;
  end if;
  if not found then raise exception 'Part not found.' using errcode = 'check_violation'; end if;
end $$;
grant execute on function set_build_part_stage(uuid, boolean, build_stage) to authenticated;
