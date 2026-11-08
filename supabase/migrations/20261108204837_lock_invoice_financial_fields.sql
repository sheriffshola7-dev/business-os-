revoke update on public.invoices from authenticated;
grant update (customer_id, invoice_number, issue_date, due_date, currency, tax_rate, status, notes, updated_at) on public.invoices to authenticated;
