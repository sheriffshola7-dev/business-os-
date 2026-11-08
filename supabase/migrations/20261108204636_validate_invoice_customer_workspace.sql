create or replace function private.validate_invoice_customer_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'The selected customer does not belong to this workspace';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_invoice_customer_workspace() from public, anon, authenticated;
grant execute on function private.validate_invoice_customer_workspace() to postgres;
create trigger invoices_validate_customer_workspace
before insert or update of customer_id, workspace_id on public.invoices
for each row execute function private.validate_invoice_customer_workspace();
