create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created','updated','deleted')),
  entity_type text not null,
  entity_id uuid,
  entity_label text not null default 'Record',
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_workspace_created_idx on public.activity_logs(workspace_id, created_at desc);
create index if not exists activity_logs_workspace_entity_idx on public.activity_logs(workspace_id, entity_type, created_at desc);

alter table public.activity_logs enable row level security;
revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;

drop policy if exists "Workspace managers read activity logs" on public.activity_logs;
create policy "Workspace managers read activity logs" on public.activity_logs
for select to authenticated
using (private.has_workspace_role(workspace_id, array['owner','admin','manager']));

create or replace function private.capture_workspace_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  old_data jsonb;
  new_data jsonb;
  row_data jsonb;
  v_workspace_id uuid;
  v_entity_id uuid;
  v_actor_id uuid;
  v_action text;
  v_entity_type text := tg_table_name;
  v_label text;
  v_changed text[] := '{}';
  field_name text;
begin
  if tg_op = 'DELETE' then
    old_data := to_jsonb(old); row_data := old_data; v_action := 'deleted';
  elsif tg_op = 'INSERT' then
    new_data := to_jsonb(new); row_data := new_data; v_action := 'created';
  else
    old_data := to_jsonb(old); new_data := to_jsonb(new); row_data := new_data; v_action := 'updated';
    for field_name in select jsonb_object_keys(new_data) loop
      if field_name not in ('updated_at') and old_data -> field_name is distinct from new_data -> field_name then
        v_changed := array_append(v_changed, field_name);
      end if;
    end loop;
    if cardinality(v_changed) = 0 then return new; end if;
  end if;
  v_workspace_id := nullif(row_data ->> 'workspace_id','')::uuid;
  if v_workspace_id is null then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  v_entity_id := nullif(row_data ->> 'id','')::uuid;
  v_actor_id := auth.uid();
  if v_actor_id is null then v_actor_id := nullif(row_data ->> 'created_by','')::uuid; end if;
  v_label := coalesce(nullif(row_data ->> 'name',''), nullif(row_data ->> 'title',''),
    nullif(row_data ->> 'description',''), nullif(row_data ->> 'invoice_number',''),
    nullif(row_data ->> 'subject',''),
    case when v_entity_type = 'workspace_members' then 'Team member' else 'Record' end);
  insert into public.activity_logs(workspace_id,actor_id,action,entity_type,entity_id,entity_label,changed_fields)
  values(v_workspace_id,v_actor_id,v_action,v_entity_type,v_entity_id,left(v_label,180),v_changed);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.capture_workspace_activity() from public, anon, authenticated;

drop trigger if exists activity_tasks on public.tasks;
create trigger activity_tasks after insert or update or delete on public.tasks for each row execute function private.capture_workspace_activity();
drop trigger if exists activity_customers on public.customers;
create trigger activity_customers after insert or update or delete on public.customers for each row execute function private.capture_workspace_activity();
drop trigger if exists activity_customer_interactions on public.customer_interactions;
create trigger activity_customer_interactions after insert or update or delete on public.customer_interactions for each row execute function private.capture_workspace_activity();
drop trigger if exists activity_expenses on public.expenses;
create trigger activity_expenses after insert or update or delete on public.expenses for each row execute function private.capture_workspace_activity();
drop trigger if exists activity_sales on public.sales;
create trigger activity_sales after insert or update or delete on public.sales for each row execute function private.capture_workspace_activity();
drop trigger if exists activity_inventory_items on public.inventory_items;
create trigger activity_inventory_items after insert or update or delete on public.inventory_items for each row execute function private.capture_workspace_activity();
drop trigger if exists activity_invoices on public.invoices;
create trigger activity_invoices after insert or update or delete on public.invoices for each row execute function private.capture_workspace_activity();
drop trigger if exists activity_workspace_members on public.workspace_members;
create trigger activity_workspace_members after insert or update or delete on public.workspace_members for each row execute function private.capture_workspace_activity();
