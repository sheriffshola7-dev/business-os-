create or replace function private.capture_workspace_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
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
  if v_workspace_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  v_entity_id := nullif(row_data ->> 'id','')::uuid;
  v_actor_id := auth.uid();
  if v_actor_id is null then v_actor_id := nullif(row_data ->> 'created_by','')::uuid; end if;
  v_label := coalesce(nullif(row_data ->> 'name',''),nullif(row_data ->> 'title',''),nullif(row_data ->> 'description',''),nullif(row_data ->> 'invoice_number',''),nullif(row_data ->> 'subject',''),case when v_entity_type='workspace_members' then 'Team member' else 'Record' end);
  insert into public.activity_logs(workspace_id,actor_id,action,entity_type,entity_id,entity_label,changed_fields)
  values(v_workspace_id,v_actor_id,v_action,v_entity_type,v_entity_id,left(v_label,180),v_changed);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;