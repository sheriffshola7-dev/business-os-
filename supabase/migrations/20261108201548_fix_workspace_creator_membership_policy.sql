create or replace function private.is_workspace_creator(p_workspace_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id = auth.uid()
    and exists (
      select 1
      from public.workspaces w
      where w.id = p_workspace_id
        and w.created_by = p_user_id
    );
$$;

revoke all on function private.is_workspace_creator(uuid, uuid) from public, anon;
grant execute on function private.is_workspace_creator(uuid, uuid) to authenticated;

drop policy if exists "workspace creators can join own new workspace" on public.workspace_members;
create policy "workspace creators can join own new workspace"
on public.workspace_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and (select private.is_workspace_creator(workspace_members.workspace_id, (select auth.uid())))
);
