create index if not exists invoices_created_by_idx on public.invoices(created_by);
create index if not exists invoice_payments_created_by_idx on public.invoice_payments(created_by);
