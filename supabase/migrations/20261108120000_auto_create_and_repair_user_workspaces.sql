-- Automatically create a private workspace for every new auth user.
-- Repair older accounts that do not yet have a workspace membership.
-- Keep this function in a non-exposed schema and restrict direct execution.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.handle_new_user_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_name text;
  new_workspace_id uuid;
begin
  workspace_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), '');
  if workspace_name is null then
    workspace_name := 'My Business';
  end if;

  insert into public.workspaces (name, created_by)
  values (left(workspace_name, 120), new.id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user_workspace() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_create_workspace on auth.users;
create trigger on_auth_user_created_create_workspace
after insert on auth.users
for each row execute function private.handle_new_user_workspace();

with users_missing_membership as (
  select
    u.id as user_id,
    left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'business_name'), ''), 'My Business'), 120) as workspace_name
  from auth.users u
  where not exists (
    select 1 from public.workspace_members wm where wm.user_id = u.id
  )
),
new_workspaces as (
  insert into public.workspaces (name, created_by)
  select um.workspace_name, um.user_id
  from users_missing_membership um
  where not exists (
    select 1 from public.workspaces w where w.created_by = um.user_id
  )
  returning id, created_by
),
available_workspaces as (
  select w.id, w.created_by
  from public.workspaces w
  join users_missing_membership um on um.user_id = w.created_by
  union
  select nw.id, nw.created_by
  from new_workspaces nw
)
insert into public.workspace_members (workspace_id, user_id, role)
select aw.id, aw.created_by, 'owner'
from available_workspaces aw
on conflict (workspace_id, user_id) do nothing;

drop policy if exists "workspace members can view own workspaces" on public.workspaces;
create policy "workspace members can view own workspaces"
on public.workspaces
for select
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = (select auth.uid())
  )
);
