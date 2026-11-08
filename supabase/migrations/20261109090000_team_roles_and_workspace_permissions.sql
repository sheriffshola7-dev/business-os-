-- Business OS team roles and workspace-level authorization.
-- This migration is committed to a feature branch only; it is not applied to production.

create schema if not exists private;

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
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role = any(p_allowed_roles)
  );
$$;

revoke all on function private.has_workspace_role(uuid, text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated;

-- Workspace member directory: members can see themselves; owners/managers can see their team.
drop policy if exists "users can view their own memberships" on public.workspace_members;
create policy "members can view own membership"
on public.workspace_members for select to authenticated
using (user_id = (select auth.uid()));

create policy "workspace leaders can view team"
on public.workspace_members for select to authenticated
using (
  (select private.has_workspace_role(workspace_id, array['owner','admin','manager']))
);

-- No direct client-side writes to memberships. Membership changes are performed
-- through narrowly scoped SECURITY DEFINER functions below.
drop policy if exists "workspace creators can add themselves" on public.workspace_members;

create or replace function public.change_workspace_member_role(
  p_membership_id uuid,
  p_new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_current_role text;
begin
  if p_new_role not in ('manager', 'employee') then
    raise exception 'Role must be manager or employee';
  end if;

  select workspace_id, role
    into v_workspace_id, v_current_role
  from public.workspace_members
  where id = p_membership_id;

  if v_workspace_id is null then
    raise exception 'Team member not found';
  end if;

  if not private.has_workspace_role(v_workspace_id, array['owner','admin']) then
    raise exception 'Only a workspace owner can change team roles';
  end if;

  if v_current_role in ('owner','admin') then
    raise exception 'Owner roles cannot be changed here';
  end if;

  update public.workspace_members
  set role = p_new_role
  where id = p_membership_id;
end;
$$;

create or replace function public.remove_workspace_member(
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_current_role text;
begin
  select workspace_id, role
    into v_workspace_id, v_current_role
  from public.workspace_members
  where id = p_membership_id;

  if v_workspace_id is null then
    raise exception 'Team member not found';
  end if;

  if not private.has_workspace_role(v_workspace_id, array['owner','admin']) then
    raise exception 'Only a workspace owner can remove team members';
  end if;

  if v_current_role in ('owner','admin') then
    raise exception 'Workspace owners cannot be removed here';
  end if;

  delete from public.workspace_members where id = p_membership_id;
end;
$$;

revoke all on function public.change_workspace_member_role(uuid, text) from public, anon;
revoke all on function public.remove_workspace_member(uuid) from public, anon;
grant execute on function public.change_workspace_member_role(uuid, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid) to authenticated;

-- Operational records: owners/managers can manage; employees are read-only.
drop policy if exists "members can manage customers" on public.customers;
create policy "workspace leaders manage customers"
on public.customers for all to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])))
with check (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(workspace_id, array['owner','admin','manager']))
);
create policy "workspace members read customers"
on public.customers for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member'])));

drop policy if exists "members can manage expenses" on public.expenses;
create policy "workspace leaders manage expenses"
on public.expenses for all to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])))
with check (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(workspace_id, array['owner','admin','manager']))
);
create policy "workspace members read expenses"
on public.expenses for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member'])));

drop policy if exists "members can manage sales" on public.sales;
create policy "workspace leaders manage sales"
on public.sales for all to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])))
with check (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(workspace_id, array['owner','admin','manager']))
);
create policy "workspace members read sales"
on public.sales for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member'])));

drop policy if exists "members can manage inventory" on public.inventory_items;
create policy "workspace leaders manage inventory"
on public.inventory_items for all to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])))
with check (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(workspace_id, array['owner','admin','manager']))
);
create policy "workspace members read inventory"
on public.inventory_items for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member'])));

drop policy if exists "members can view inventory movements" on public.inventory_movements;
create policy "workspace members read inventory movements"
on public.inventory_movements for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member'])));

drop policy if exists "members can add inventory adjustments" on public.inventory_movements;
create policy "workspace leaders add inventory adjustments"
on public.inventory_movements for insert to authenticated
with check (
  created_by = (select auth.uid())
  and movement_type = 'adjustment'
  and sale_id is null
  and (select private.has_workspace_role(workspace_id, array['owner','admin','manager']))
);

-- Tasks are shared work: all workspace roles can create and update tasks.
drop policy if exists "members can add tasks" on public.tasks;
create policy "workspace members add tasks"
on public.tasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member']))
);

drop policy if exists "members can update tasks" on public.tasks;
create policy "workspace members update tasks"
on public.tasks for update to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member'])))
with check ((select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member'])));

drop policy if exists "members can delete tasks" on public.tasks;
create policy "workspace leaders delete tasks"
on public.tasks for delete to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])));

-- Workspace profile updates remain owner-only.
drop policy if exists "workspace owners can update workspaces" on public.workspaces;
create policy "workspace owners can update workspaces"
on public.workspaces for update to authenticated
using (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(id, array['owner','admin']))
)
with check (created_by = (select auth.uid()));
