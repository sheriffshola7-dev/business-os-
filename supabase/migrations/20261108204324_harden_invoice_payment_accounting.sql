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
    and (tg_op = 'DELETE' or p.id <> new.id);

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
    if new.amount_paid <> 0 or new.status not in ('draft','sent') then
      raise exception 'New invoices must start unpaid in draft or sent status';
    end if;
    return new;
  end if;

  if v_claim_role = 'authenticated' and pg_trigger_depth() <= 1 then
    if new.amount_paid is distinct from old.amount_paid then
      raise exception 'Invoice paid amount is maintained by payment records';
    end if;
    if new.status is distinct from old.status and new.status in ('paid','partially_paid') then
      raise exception 'Invoice payment status is maintained by payment records';
    end if;
  end if;

  if new.total_amount < new.amount_paid then
    raise exception 'Invoice total cannot be lower than payments already recorded';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_protect_paid_amount on public.invoices;
create trigger invoices_protect_paid_amount
before insert or update on public.invoices
for each row execute function private.protect_invoice_amount_paid();

create or replace function private.protect_invoice_item_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.invoice_id is distinct from old.invoice_id then
    raise exception 'Invoice items cannot be moved between invoices';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_invoice_item_parent() from public, anon, authenticated;
create trigger invoice_items_protect_parent
before update on public.invoice_items
for each row execute function private.protect_invoice_item_parent();

create or replace function private.protect_invoice_payment_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.invoice_id is distinct from old.invoice_id or new.created_by is distinct from old.created_by then
    raise exception 'Invoice payment parent and creator cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_invoice_payment_parent() from public, anon, authenticated;
create trigger invoice_payments_protect_parent
before update on public.invoice_payments
for each row execute function private.protect_invoice_payment_parent();
