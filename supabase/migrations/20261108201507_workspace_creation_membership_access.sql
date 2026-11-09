drop policy if exists "workspace creators can join own new workspace" on public.workspace_members;
create policy "workspace creators can join own new workspace"
on public.workspace_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.created_by = (select auth.uid())
  )
);
