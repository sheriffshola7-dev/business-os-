-- Refine role policies: avoid exposed SECURITY DEFINER RPCs and overlapping RLS policies.
create or replace function private.prevent_workspace_member_identity_change()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Workspace membership identity cannot be changed';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_workspace_member_identity_change on public.workspace_members;
create trigger prevent_workspace_member_identity_change
before update on public.workspace_members
for each row execute function private.prevent_workspace_member_identity_change();

create or replace function private.prevent_business_record_scope_change()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Record workspace and creator cannot be changed';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_customer_scope_change on public.customers;
create trigger prevent_customer_scope_change before update on public.customers
for each row execute function private.prevent_business_record_scope_change();
drop trigger if exists prevent_expense_scope_change on public.expenses;
create trigger prevent_expense_scope_change before update on public.expenses
for each row execute function private.prevent_business_record_scope_change();
drop trigger if exists prevent_sale_scope_change on public.sales;
create trigger prevent_sale_scope_change before update on public.sales
for each row execute function private.prevent_business_record_scope_change();
drop trigger if exists prevent_inventory_scope_change on public.inventory_items;
create trigger prevent_inventory_scope_change before update on public.inventory_items
for each row execute function private.prevent_business_record_scope_change();

-- Members can see themselves; leaders can see the team. One SELECT policy avoids overlap.
drop policy if exists "members can view own membership" on public.workspace_members;
drop policy if exists "workspace leaders can view team" on public.workspace_members;
drop policy if exists "workspace members view own and team" on public.workspace_members;
create policy "workspace members view own and team"
on public.workspace_members for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_workspace_role(workspace_id,array['owner','admin','manager']))
);

-- Role changes and removals are now SECURITY INVOKER operations governed by RLS.
drop policy if exists "workspace owners update team roles" on public.workspace_members;
create policy "workspace owners update team roles"
on public.workspace_members for update to authenticated
using (
  (select private.has_workspace_role(workspace_id,array['owner','admin']))
  and role in ('manager','employee','member')
)
with check (
  (select private.has_workspace_role(workspace_id,array['owner','admin']))
  and role in ('manager','employee')
);

drop policy if exists "workspace owners remove team members" on public.workspace_members;
create policy "workspace owners remove team members"
on public.workspace_members for delete to authenticated
using (
  (select private.has_workspace_role(workspace_id,array['owner','admin']))
  and role in ('manager','employee','member')
);

grant update, delete on public.workspace_members to authenticated;
alter function public.change_workspace_member_role(uuid,text) security invoker;
alter function public.remove_workspace_member(uuid) security invoker;
revoke all on function public.change_workspace_member_role(uuid,text) from public, anon;
revoke all on function public.remove_workspace_member(uuid) from public, anon;
grant execute on function public.change_workspace_member_role(uuid,text) to authenticated;
grant execute on function public.remove_workspace_member(uuid) to authenticated;

-- Consolidate business table policies so SELECT is not covered by two permissive policies.
drop policy if exists "workspace leaders manage customers" on public.customers;
drop policy if exists "workspace members read customers" on public.customers;
create policy "workspace members read customers" on public.customers for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));
create policy "workspace leaders insert customers" on public.customers for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace leaders update customers" on public.customers for update to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])))
with check ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace leaders delete customers" on public.customers for delete to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));

drop policy if exists "workspace leaders manage expenses" on public.expenses;
drop policy if exists "workspace members read expenses" on public.expenses;
create policy "workspace members read expenses" on public.expenses for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));
create policy "workspace leaders insert expenses" on public.expenses for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace leaders update expenses" on public.expenses for update to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])))
with check ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace leaders delete expenses" on public.expenses for delete to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));

drop policy if exists "workspace leaders manage sales" on public.sales;
drop policy if exists "workspace members read sales" on public.sales;
create policy "workspace members read sales" on public.sales for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));
create policy "workspace leaders insert sales" on public.sales for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace leaders update sales" on public.sales for update to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])))
with check ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace leaders delete sales" on public.sales for delete to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));

drop policy if exists "workspace leaders manage inventory" on public.inventory_items;
drop policy if exists "workspace members read inventory" on public.inventory_items;
create policy "workspace members read inventory" on public.inventory_items for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));
create policy "workspace leaders insert inventory" on public.inventory_items for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace leaders update inventory" on public.inventory_items for update to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])))
with check ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));
create policy "workspace leaders delete inventory" on public.inventory_items for delete to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager'])));

-- Restore task visibility for all workspace roles.
drop policy if exists "workspace members read tasks" on public.tasks;
create policy "workspace members read tasks" on public.tasks for select to authenticated
using ((select private.has_workspace_role(workspace_id,array['owner','admin','manager','employee','member'])));

-- Add indexes for foreign keys introduced or highlighted by the advisor.
create index if not exists customers_created_by_idx on public.customers(created_by);
create index if not exists expenses_created_by_idx on public.expenses(created_by);
create index if not exists inventory_items_created_by_idx on public.inventory_items(created_by);
create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to);
create index if not exists tasks_created_by_idx on public.tasks(created_by);
create index if not exists workspace_invitations_accepted_by_idx on public.workspace_invitations(accepted_by);
create index if not exists workspace_invitations_invited_by_idx on public.workspace_invitations(invited_by);
create index if not exists workspaces_created_by_idx on public.workspaces(created_by);
