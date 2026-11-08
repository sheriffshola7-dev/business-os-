revoke update (subtotal, tax_amount, total_amount) on public.invoices from authenticated;

create or replace function private.protect_invoice_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if tg_op = 'INSERT' then
    new.subtotal := 0;
    new.tax_amount := 0;
    new.total_amount := 0;
    new.amount_paid := 0;
    new.status := 'draft';
    return new;
  end if;

  if v_claim_role = 'authenticated' and pg_trigger_depth() <= 1 then
    if new.amount_paid is distinct from old.amount_paid then
      raise exception 'Invoice paid amount is maintained by payment records';
    end if;
    if new.status is distinct from old.status then
      if new.status = 'sent' and old.status = 'draft' and new.amount_paid = 0 then
        null;
      elsif new.status = 'void' and old.status in ('draft','sent') and old.amount_paid = 0 then
        null;
      else
        raise exception 'Invoice payment status is maintained by payment records';
      end if;
    end if;
  end if;

  if new.total_amount < new.amount_paid then
    raise exception 'Invoice total cannot be lower than payments already recorded';
  end if;
  return new;
end;
$$;