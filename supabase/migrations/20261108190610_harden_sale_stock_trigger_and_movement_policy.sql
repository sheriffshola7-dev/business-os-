drop policy if exists "members can add inventory adjustments" on public.inventory_movements;
create policy "members can add inventory adjustments"
  on public.inventory_movements for insert
  with check (
    created_by = (select auth.uid())
    and movement_type = 'adjustment'
    and sale_id is null
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = inventory_movements.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create or replace function public.apply_sale_inventory_stock()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_should_restore boolean := false;
  v_should_deduct boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_should_restore :=
      old.status = 'completed'
      and (
        new.status <> 'completed'
        or old.inventory_item_id is distinct from new.inventory_item_id
        or old.quantity is distinct from new.quantity
      );
  end if;

  if v_should_restore and old.inventory_item_id is not null then
    update public.inventory_items
    set quantity = quantity + old.quantity,
        updated_at = now()
    where id = old.inventory_item_id
      and workspace_id = old.workspace_id;

    insert into public.inventory_movements (
      workspace_id, inventory_item_id, sale_id, movement_type,
      quantity_change, note, created_by
    ) values (
      old.workspace_id, old.inventory_item_id, old.id, 'sale_return',
      old.quantity, 'Stock returned because the sale was changed.', old.created_by
    );
  end if;

  if tg_op = 'INSERT' then
    v_should_deduct := new.status = 'completed' and new.inventory_item_id is not null;
  else
    v_should_deduct :=
      new.status = 'completed'
      and new.inventory_item_id is not null
      and (
        old.status <> 'completed'
        or old.inventory_item_id is distinct from new.inventory_item_id
        or old.quantity is distinct from new.quantity
      );
  end if;

  if v_should_deduct then
    update public.inventory_items
    set quantity = quantity - new.quantity,
        updated_at = now()
    where id = new.inventory_item_id
      and workspace_id = new.workspace_id
      and quantity >= new.quantity;

    if not found then
      raise exception 'Not enough stock available to complete this sale.';
    end if;

    insert into public.inventory_movements (
      workspace_id, inventory_item_id, sale_id, movement_type,
      quantity_change, note, created_by
    ) values (
      new.workspace_id, new.inventory_item_id, new.id, 'sale_out',
      -new.quantity, 'Stock deducted for completed sale.', new.created_by
    );
  end if;

  return new;
end;
$$;

revoke all on function public.apply_sale_inventory_stock() from public;