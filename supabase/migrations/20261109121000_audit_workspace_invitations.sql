drop trigger if exists activity_workspace_invitations on public.workspace_invitations;
create trigger activity_workspace_invitations
after insert or update or delete on public.workspace_invitations
for each row execute function private.capture_workspace_activity();
