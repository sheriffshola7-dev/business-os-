create or replace function public.adjust_inventory_stock(
  p_inventory_item_id uuid,
  p_quantity_change numeric,
  p_note text default null
) returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to adjust stock.';
  end if;
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Enter a non-zero stock change.';
  end if;

  select workspace_id into v_workspace_id
  from public.inventory_items
  where id = p_inventory_item_id
  for update;

  if v_workspace_id is null or not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = v_workspace_id and wm.user_id = auth.uid()
  ) then
    raise exception 'Inventory item not found in your workspace.';
  end if;

  update public.inventory_items
  set quantity = quantity + p_quantity_change,
      updated_at = now()
  where id = p_inventory_item_id
    and workspace_id = v_workspace_id
    and quantity + p_quantity_change >= 0;

  if not found then
    raise exception 'Stock cannot be reduced below zero.';
  end if;

  insert into public.inventory_movements (
    workspace_id, inventory_item_id, movement_type,
    quantity_change, note, created_by
  ) values (
    v_workspace_id, p_inventory_item_id, 'adjustment',
    p_quantity_change, nullif(trim(p_note), ''), auth.uid()
  );
end;
$$;

revoke all on function public.adjust_inventory_stock(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.adjust_inventory_stock(uuid, numeric, text) to authenticated;

revoke all on function public.apply_sale_inventory_stock() from public, anon, authenticated;

create index if not exists sales_customer_id_idx
  on public.sales (customer_id);
create index if not exists sales_created_by_idx
  on public.sales (created_by);
create index if not exists sales_inventory_item_workspace_idx
  on public.sales (inventory_item_id, workspace_id)
  where inventory_item_id is not null;
create index if not exists inventory_movements_created_by_idx
  on public.inventory_movements (created_by);
create index if not exists inventory_movements_item_workspace_idx
  on public.inventory_movements (inventory_item_id, workspace_id);
create index if not exists inventory_movements_sale_id_idx
  on public.inventory_movements (sale_id);