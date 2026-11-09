alter table public.customers add column if not exists status text not null default 'active';
alter table public.customers add constraint customers_status_check check (status in ('lead','active','inactive'));
create table if not exists public.customer_interactions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 interaction_type text not null check (interaction_type in ('call','email','meeting','message','note')),
 subject text not null,
 notes text,
 follow_up_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists customer_interactions_workspace_customer_created_idx on public.customer_interactions(workspace_id,customer_id,created_at desc);
create index if not exists customer_interactions_follow_up_idx on public.customer_interactions(workspace_id,follow_up_at) where follow_up_at is not null;
alter table public.customer_interactions enable row level security;
grant select on public.customer_interactions to authenticated;
grant insert,update,delete on public.customer_interactions to authenticated;
drop policy if exists "Workspace members read customer interactions" on public.customer_interactions;
create policy "Workspace members read customer interactions" on public.customer_interactions for select to authenticated using (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=customer_interactions.workspace_id and wm.user_id=(select auth.uid()))
);
drop policy if exists "Managers create customer interactions" on public.customer_interactions;
create policy "Managers create customer interactions" on public.customer_interactions for insert to authenticated with check (
 created_by=(select auth.uid()) and private.has_workspace_role(workspace_id,array['owner','admin','manager'])
 and exists(select 1 from public.customers c where c.id=customer_id and c.workspace_id=customer_interactions.workspace_id)
);
drop policy if exists "Managers update customer interactions" on public.customer_interactions;
create policy "Managers update customer interactions" on public.customer_interactions for update to authenticated using (
 private.has_workspace_role(workspace_id,array['owner','admin','manager'])
) with check (
 private.has_workspace_role(workspace_id,array['owner','admin','manager'])
 and exists(select 1 from public.customers c where c.id=customer_id and c.workspace_id=customer_interactions.workspace_id)
 and created_by=(select auth.uid())
);
drop policy if exists "Managers delete customer interactions" on public.customer_interactions;
create policy "Managers delete customer interactions" on public.customer_interactions for delete to authenticated using (
 private.has_workspace_role(workspace_id,array['owner','admin','manager'])
);
