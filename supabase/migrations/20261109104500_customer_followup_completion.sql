alter table public.customer_interactions
  add column if not exists follow_up_completed_at timestamptz;

create index if not exists customer_interactions_open_followups_idx
  on public.customer_interactions(workspace_id, follow_up_at)
  where follow_up_at is not null and follow_up_completed_at is null;
