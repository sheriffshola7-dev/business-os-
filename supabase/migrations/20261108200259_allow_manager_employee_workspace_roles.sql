-- Expand workspace membership roles to the supported Business OS team roles.
alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner','admin','manager','employee','member'));
