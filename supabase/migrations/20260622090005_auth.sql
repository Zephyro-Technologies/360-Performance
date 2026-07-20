-- ===========================================================================
-- 360 Performance — auth wiring (Phase 3)
-- Profile creation + first-admin bootstrap + access-token role claim.
-- Authorization is ALWAYS server-side: has_role() (functions_triggers migration)
-- reads profiles DIRECTLY, so a role change takes effect immediately in RLS —
-- the JWT claim below is a UX convenience only (bounded by a short token TTL).
-- ===========================================================================

-- Every new auth user gets a profile. The FIRST user (no admin yet) is promoted
-- to admin — a secure, server-side, one-time bootstrap (role is never client-set).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  no_admin_yet boolean;
begin
  select not exists (select 1 from profiles where role = 'admin') into no_admin_yet;
  insert into profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    case when no_admin_yet then 'admin'::user_role else 'viewer'::user_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Custom access-token hook: stamps the caller's role into the JWT as `user_role`
-- (for client-side UX gating). RLS does NOT rely on this claim.
create or replace function custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  claims jsonb;
  v_role user_role;
begin
  select role into v_role from profiles where id = (event->>'user_id')::uuid;
  claims := coalesce(event->'claims', '{}'::jsonb);
  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role::text));
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;

-- Only the auth admin may run the hook.
grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function custom_access_token_hook(jsonb) from authenticated, anon, public;
grant all on table profiles to supabase_auth_admin;
