create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_number text not null,
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0 and amount_paid <= total_amount),
  status text not null default 'draft' check (status = any (array['draft','sent','partially_paid','paid','void'])),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_workspace_number_unique unique(workspace_id, invoice_number),
  constraint invoices_due_after_issue check (due_date is null or due_date >= issue_date)
);

create index invoices_workspace_date_idx on public.invoices(workspace_id, issue_date desc);
create index invoices_customer_idx on public.invoices(customer_id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 200),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now()
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payment_date date not null default current_date,
  payment_method text,
  reference text,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index invoice_payments_invoice_idx on public.invoice_payments(invoice_id, payment_date desc);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;

grant select, insert, delete on public.invoices to authenticated;
grant update (customer_id, invoice_number, issue_date, due_date, currency, subtotal, tax_rate, tax_amount, total_amount, status, notes, updated_at) on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;
grant select, insert, update, delete on public.invoice_payments to authenticated;

create policy "Workspace members read invoices"
on public.invoices for select to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager','employee','member'])));
create policy "Workspace leaders create invoices"
on public.invoices for insert to authenticated
with check (created_by = (select auth.uid()) and (select private.has_workspace_role(workspace_id, array['owner','admin','manager'])));
create policy "Workspace leaders update invoices"
on public.invoices for update to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])))
with check ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])));
create policy "Workspace leaders delete invoices"
on public.invoices for delete to authenticated
using ((select private.has_workspace_role(workspace_id, array['owner','admin','manager'])));

create policy "Workspace members read invoice items"
on public.invoice_items for select to authenticated
using (exists (select 1 from public.invoices i where i.id=invoice_items.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager','employee','member']))));
create policy "Workspace leaders create invoice items"
on public.invoice_items for insert to authenticated
with check (exists (select 1 from public.invoices i where i.id=invoice_items.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager']))));
create policy "Workspace leaders update invoice items"
on public.invoice_items for update to authenticated
using (exists (select 1 from public.invoices i where i.id=invoice_items.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager']))))
with check (exists (select 1 from public.invoices i where i.id=invoice_items.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager']))));
create policy "Workspace leaders delete invoice items"
on public.invoice_items for delete to authenticated
using (exists (select 1 from public.invoices i where i.id=invoice_items.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager']))));

create policy "Workspace members read invoice payments"
on public.invoice_payments for select to authenticated
using (exists (select 1 from public.invoices i where i.id=invoice_payments.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager','employee','member']))));
create policy "Workspace leaders create invoice payments"
on public.invoice_payments for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.invoices i where i.id=invoice_payments.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager']))));
create policy "Workspace leaders update invoice payments"
on public.invoice_payments for update to authenticated
using (exists (select 1 from public.invoices i where i.id=invoice_payments.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager']))))
with check (created_by = (select auth.uid()) and exists (select 1 from public.invoices i where i.id=invoice_payments.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager']))));
create policy "Workspace leaders delete invoice payments"
on public.invoice_payments for delete to authenticated
using (exists (select 1 from public.invoices i where i.id=invoice_payments.invoice_id and (select private.has_workspace_role(i.workspace_id, array['owner','admin','manager']))));

create or replace function private.sync_invoice_payment_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_paid numeric(14,2);
  v_total numeric(14,2);
  v_currency text;
  v_old_paid numeric(14,2);
begin
  if tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;

  select i.total_amount, i.currency into v_total, v_currency
  from public.invoices i where i.id = v_invoice_id for update;

  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op <> 'DELETE' and new.currency <> v_currency then
    raise exception 'Payment currency must match the invoice currency';
  end if;

  select coalesce(sum(p.amount),0) into v_paid
  from public.invoice_payments p
  where p.invoice_id = v_invoice_id
    and (tg_op <> 'UPDATE' or p.id <> new.id);

  if tg_op <> 'DELETE' then
    v_paid := v_paid + new.amount;
  end if;

  if v_paid > v_total then
    raise exception 'Payment exceeds the outstanding invoice balance';
  end if;

  update public.invoices
  set amount_paid = v_paid,
      status = case
        when v_paid >= total_amount and total_amount > 0 then 'paid'
        when v_paid > 0 then 'partially_paid'
        when status in ('paid','partially_paid') then 'sent'
        else status
      end,
      updated_at = now()
  where id = v_invoice_id;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function private.sync_invoice_payment_totals() from public, anon, authenticated;
grant execute on function private.sync_invoice_payment_totals() to postgres;

create trigger invoice_payments_sync_totals
after insert or update or delete on public.invoice_payments
for each row execute function private.sync_invoice_payment_totals();

create or replace function private.protect_invoice_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.amount_paid is distinct from old.amount_paid and current_user <> 'postgres' then
    raise exception 'Invoice paid amount is maintained by payment records';
  end if;
  if new.total_amount < new.amount_paid then
    raise exception 'Invoice total cannot be lower than payments already recorded';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_invoice_amount_paid() from public, anon, authenticated;
grant execute on function private.protect_invoice_amount_paid() to postgres;
create trigger invoices_protect_paid_amount
before update on public.invoices
for each row execute function private.protect_invoice_amount_paid();

create or replace function private.protect_invoice_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id or new.created_by is distinct from old.created_by then
    raise exception 'Invoice workspace and creator cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_invoice_scope() from public, anon, authenticated;
grant execute on function private.protect_invoice_scope() to postgres;
create trigger invoices_protect_scope
before update on public.invoices
for each row execute function private.protect_invoice_scope();

create or replace function private.recalculate_invoice_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_subtotal numeric(14,2);
  v_tax_rate numeric(7,4);
  v_paid numeric(14,2);
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select coalesce(sum(ii.line_total),0) into v_subtotal
  from public.invoice_items ii where ii.invoice_id=v_invoice_id;
  select i.tax_rate, i.amount_paid into v_tax_rate, v_paid
  from public.invoices i where i.id=v_invoice_id for update;
  update public.invoices
  set subtotal=v_subtotal,
      tax_amount=round(v_subtotal * v_tax_rate / 100,2),
      total_amount=round(v_subtotal + (v_subtotal * v_tax_rate / 100),2),
      updated_at=now()
  where id=v_invoice_id and v_paid <= round(v_subtotal + (v_subtotal * v_tax_rate / 100),2);
  if not found then
    raise exception 'Invoice total cannot be reduced below payments already recorded';
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function private.recalculate_invoice_amounts() from public, anon, authenticated;
grant execute on function private.recalculate_invoice_amounts() to postgres;
create trigger invoice_items_recalculate_amounts
after insert or update or delete on public.invoice_items
for each row execute function private.recalculate_invoice_amounts();

create or replace function private.recalculate_invoice_tax()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(14,2);
begin
  v_total := round(new.subtotal + (new.subtotal * new.tax_rate / 100),2);
  if v_total < new.amount_paid then
    raise exception 'Invoice total cannot be lower than payments already recorded';
  end if;
  new.tax_amount := round(new.subtotal * new.tax_rate / 100,2);
  new.total_amount := v_total;
  return new;
end;
$$;
revoke all on function private.recalculate_invoice_tax() from public, anon, authenticated;
grant execute on function private.recalculate_invoice_tax() to postgres;
create trigger invoices_recalculate_tax
before insert or update of subtotal, tax_rate on public.invoices
for each row execute function private.recalculate_invoice_tax();
