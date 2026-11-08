-- Business OS: workspace roles, invitations, and multi-currency preferences.
-- Apply only after the feature branch has passed review.

create schema if not exists private;

alter table public.workspaces
  add column if not exists country_code text,
  add column if not exists currency text not null default 'USD';

-- Preserve the currency already used by existing records; new workspaces default to USD.
update public.workspaces w
set currency = 'NGN'
where exists (
  select 1 from public.sales s where s.workspace_id = w.id and s.currency = 'NGN'
) or exists (
  select 1 from public.expenses e where e.workspace_id = w.id and e.currency = 'NGN'
);

alter table public.workspaces
  drop constraint if exists workspaces_currency_code_check;
alter table public.workspaces
  add constraint workspaces_currency_code_check
  check (currency ~ '^[A-Z]{3}$');

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager','employee')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists workspace_invitations_one_pending_email
  on public.workspace_invitations(workspace_id, lower(email))
  where status = 'pending';
create index if not exists workspace_invitations_workspace_status_idx
  on public.workspace_invitations(workspace_id, status, created_at desc);

alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from anon, authenticated;
grant select on public.workspace_invitations to authenticated;
drop policy if exists "workspace leaders view invitations" on public.workspace_invitations;
create policy "workspace leaders view invitations"
on public.workspace_invitations for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin'])));

create or replace function private.has_workspace_role(
  p_workspace_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = any(p_allowed_roles)
  );
$$;
revoke all on function private.has_workspace_role(uuid, text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated;

-- Remove the broad member policies before installing role-aware policies.
drop policy if exists "users can view their own memberships" on public.workspace_members;
drop policy if exists "workspace creators can add themselves" on public.workspace_members;
create policy "members can view own membership"
on public.workspace_members for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists "workspace leaders can view team" on public.workspace_members;
create policy "workspace leaders can view team"
on public.workspace_members for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])));

create or replace function public.change_workspace_member_role(
  p_membership_id uuid,
  p_new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_workspace_id uuid; v_current_role text;
begin
  if p_new_role not in ('manager','employee') then
    raise exception 'Role must be manager or employee';
  end if;
  select workspace_id, role into v_workspace_id, v_current_role
  from public.workspace_members where id = p_membership_id;
  if v_workspace_id is null then raise exception 'Team member not found'; end if;
  if not private.has_workspace_role(v_workspace_id, array['owner','admin']) then
    raise exception 'Only a workspace owner can change team roles';
  end if;
  if v_current_role in ('owner','admin') then
    raise exception 'Owner roles cannot be changed here';
  end if;
  update public.workspace_members set role = p_new_role where id = p_membership_id;
end;
$$;

create or replace function public.remove_workspace_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_workspace_id uuid; v_current_role text;
begin
  select workspace_id, role into v_workspace_id, v_current_role
  from public.workspace_members where id = p_membership_id;
  if v_workspace_id is null then raise exception 'Team member not found'; end if;
  if not private.has_workspace_role(v_workspace_id, array['owner','admin']) then
    raise exception 'Only a workspace owner can remove team members';
  end if;
  if v_current_role in ('owner','admin') then
    raise exception 'Workspace owners cannot be removed here';
  end if;
  delete from public.workspace_members where id = p_membership_id;
end;
$$;

revoke all on function public.change_workspace_member_role(uuid,text) from public, anon;
revoke all on function public.remove_workspace_member(uuid) from public, anon;
grant execute on function public.change_workspace_member_role(uuid,text) to authenticated;
grant execute on function public.remove_workspace_member(uuid) to authenticated;

-- Prevent task updates from moving records across workspaces or changing ownership.
create or replace function private.prevent_task_scope_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Task workspace and creator cannot be changed';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_task_scope_change on public.tasks;
create trigger prevent_task_scope_change before update on public.tasks
for each row execute function private.prevent_task_scope_change();

-- Customers, expenses, sales and inventory are read-only for employees.
drop policy if exists "members can manage customers" on public.customers;
drop policy if exists "workspace leaders manage customers" on public.customers;
drop policy if exists "workspace members read customers" on public.customers;
create policy "workspace leaders manage customers" on public.customers for all to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])))
with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace members read customers" on public.customers for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));

drop policy if exists "members can manage expenses" on public.expenses;
drop policy if exists "workspace leaders manage expenses" on public.expenses;
drop policy if exists "workspace members read expenses" on public.expenses;
create policy "workspace leaders manage expenses" on public.expenses for all to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])))
with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace members read expenses" on public.expenses for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));

drop policy if exists "members can manage sales" on public.sales;
drop policy if exists "workspace leaders manage sales" on public.sales;
drop policy if exists "workspace members read sales" on public.sales;
create policy "workspace leaders manage sales" on public.sales for all to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])))
with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace members read sales" on public.sales for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));

drop policy if exists "members can manage inventory" on public.inventory_items;
drop policy if exists "workspace leaders manage inventory" on public.inventory_items;
drop policy if exists "workspace members read inventory" on public.inventory_items;
create policy "workspace leaders manage inventory" on public.inventory_items for all to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])))
with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace members read inventory" on public.inventory_items for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));

drop policy if exists "members can view inventory movements" on public.inventory_movements;
drop policy if exists "workspace members read inventory movements" on public.inventory_movements;
create policy "workspace members read inventory movements" on public.inventory_movements for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));
drop policy if exists "members can add inventory adjustments" on public.inventory_movements;
drop policy if exists "workspace leaders add inventory adjustments" on public.inventory_movements;
create policy "workspace leaders add inventory adjustments" on public.inventory_movements for insert to authenticated
with check (created_by = (select auth.uid()) and movement_type = 'adjustment' and sale_id is null
  and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));

drop policy if exists "members can read tasks" on public.tasks;
drop policy if exists "workspace members add tasks" on public.tasks;
drop policy if exists "members can add tasks" on public.tasks;
create policy "workspace members add tasks" on public.tasks for insert to authenticated
with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));
drop policy if exists "members can update tasks" on public.tasks;
drop policy if exists "workspace members update tasks" on public.tasks;
create policy "workspace members update tasks" on public.tasks for update to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])))
with check ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));
drop policy if exists "members can delete tasks" on public.tasks;
drop policy if exists "workspace leaders delete tasks" on public.tasks;
create policy "workspace leaders delete tasks" on public.tasks for delete to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));

-- Workspace settings can only be changed by owners/admins.
drop policy if exists "workspace owners can update workspaces" on public.workspaces;
create policy "workspace owners can update workspaces" on public.workspaces for update to authenticated
using (created_by = (select auth.uid()) and (select private.has_workspace_role(id,array['owner','admin'])))
with check (created_by = (select auth.uid()));

-- New user signups normally receive a USD-default workspace. Invited signups join the
-- invited workspace instead of creating an unrelated personal workspace.
create or replace function private.handle_new_user_workspace()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_workspace_name text;
  v_workspace_id uuid;
  v_invitation_id uuid;
  v_invitation record;
begin
  begin
    v_invitation_id := nullif(new.raw_user_meta_data ->> 'workspace_invitation_id','')::uuid;
  exception when others then
    v_invitation_id := null;
  end;
  if v_invitation_id is not null then
    select * into v_invitation
    from public.workspace_invitations
    where id = v_invitation_id
      and lower(email) = lower(new.email)
      and status = 'pending'
      and expires_at > now()
    for update;
    if found then
      insert into public.workspace_members(workspace_id,user_id,role)
      values(v_invitation.workspace_id,new.id,v_invitation.role)
      on conflict(workspace_id,user_id) do nothing;
      update public.workspace_invitations
      set status='accepted', accepted_by=new.id
      where id=v_invitation.id;
      return new;
    end if;
  end if;

  v_workspace_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'business_name','')),'');
  if v_workspace_name is null then v_workspace_name := 'My Business'; end if;
  insert into public.workspaces(name,created_by) values(left(v_workspace_name,120),new.id)
  returning id into v_workspace_id;
  insert into public.workspace_members(workspace_id,user_id,role)
  values(v_workspace_id,new.id,'owner')
  on conflict(workspace_id,user_id) do nothing;
  return new;
end;
$$;

-- Invitation records are only created/revoked by the authenticated Edge Function
-- using the service-role key. The client cannot write invitation rows directly.
