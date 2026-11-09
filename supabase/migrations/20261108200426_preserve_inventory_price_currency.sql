-- Keep inventory unit prices tied to the currency in which they were entered.
alter table public.inventory_items
  add column if not exists currency text not null default 'USD';

update public.inventory_items i
set currency = w.currency
from public.workspaces w
where w.id = i.workspace_id;

alter table public.inventory_items
  drop constraint if exists inventory_items_currency_code_check;
alter table public.inventory_items
  add constraint inventory_items_currency_code_check
  check (currency ~ '^[A-Z]{3}$');

-- USD is the platform default for new financial rows; app writes the selected
-- workspace currency explicitly for every new sale and expense.
alter table public.sales alter column currency set default 'USD';
alter table public.expenses alter column currency set default 'USD';
