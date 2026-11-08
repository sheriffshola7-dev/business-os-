alter table public.inventory_items
  add constraint inventory_items_id_workspace_key unique (id, workspace_id);

alter table public.sales
  add column inventory_item_id uuid,
  add column quantity numeric not null default 1,
  add constraint sales_quantity_positive_check check (quantity > 0),
  add constraint sales_inventory_item_workspace_fkey
    foreign key (inventory_item_id, workspace_id)
    references public.inventory_items (id, workspace_id)
    on delete restrict;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_item_id uuid not null,
  sale_id uuid references public.sales(id) on delete set null,
  movement_type text not null check (movement_type in ('sale_out','sale_return','adjustment')),
  quantity_change numeric not null check (quantity_change <> 0),
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_movements_item_workspace_fkey
    foreign key (inventory_item_id, workspace_id)
    references public.inventory_items (id, workspace_id)
    on delete restrict
);

create index inventory_movements_workspace_created_idx
  on public.inventory_movements (workspace_id, created_at desc);
create index sales_inventory_item_idx
  on public.sales (inventory_item_id)
  where inventory_item_id is not null;

alter table public.inventory_movements enable row level security;

create policy "members can view inventory movements"
  on public.inventory_movements for select
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = inventory_movements.workspace_id
      and wm.user_id = (select auth.uid())
  ));

create policy "members can add inventory adjustments"
  on public.inventory_movements for insert
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = inventory_movements.workspace_id
        and wm.user_id = (select auth.uid())
    )
  );

create or replace function public.adjust_inventory_stock(
  p_inventory_item_id uuid,
  p_quantity_change numeric,
  p_note text default null
) returns void
language plpgsql
security definer
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

  v_should_deduct :=
    new.status = 'completed'
    and new.inventory_item_id is not null
    and (
      tg_op = 'INSERT'
      or old.status <> 'completed'
      or old.inventory_item_id is distinct from new.inventory_item_id
      or old.quantity is distinct from new.quantity
    );

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

create trigger sales_apply_inventory_stock
after insert or update of status, inventory_item_id, quantity
on public.sales
for each row execute function public.apply_sale_inventory_stock();

revoke all on function public.adjust_inventory_stock(uuid, numeric, text) from public;
grant execute on function public.adjust_inventory_stock(uuid, numeric, text) to authenticated;
revoke all on function public.apply_sale_inventory_stock() from public;
