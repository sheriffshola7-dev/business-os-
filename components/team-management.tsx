"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, LoaderCircle, MailPlus, RefreshCw, ShieldCheck, UserMinus, Users, XCircle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Member = { id: string; user_id: string; role: string; created_at: string };
type Invitation = { id: string; email: string; role: string; status: string; expires_at: string; created_at: string };
type Props = { supabase: SupabaseClient<Database> | null; workspaceId: string; currentUserId: string };

export default function TeamManagement({ supabase, workspaceId, currentUserId }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [myRole, setMyRole] = useState("employee");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "employee">("employee");

  const loadMembers = useCallback(async () => {
    if (!supabase || !workspaceId) { setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.from("workspace_members")
      .select("id,user_id,role,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
    if (queryError) { setError(queryError.message); setMembers([]); }
    else {
      const rows = (data || []) as Member[];
      setMembers(rows);
      setMyRole(rows.find((member) => member.user_id === currentUserId)?.role || "employee");
    }
    setLoading(false);
  }, [supabase, workspaceId, currentUserId]);

  const loadInvitations = useCallback(async () => {
    if (!supabase || !workspaceId) return;
    const { data, error: queryError } = await supabase.from("workspace_invitations")
      .select("id,email,role,status,expires_at,created_at").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }).limit(30);
    if (!queryError) setInvitations((data || []) as Invitation[]);
  }, [supabase, workspaceId]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);
  useEffect(() => { void loadInvitations(); }, [loadInvitations]);

  const isOwner = myRole === "owner" || myRole === "admin";
  const canSeeTeam = isOwner || myRole === "manager";

  async function changeRole(member: Member, role: "manager" | "employee") {
    if (!supabase || !isOwner) return;
    setBusyId(member.id); setError(""); setNotice("");
    const { error: actionError } = await supabase.rpc("change_workspace_member_role", { p_membership_id: member.id, p_new_role: role });
    if (actionError) setError(actionError.message);
    else { setNotice("Team member role updated."); await loadMembers(); }
    setBusyId("");
  }

  async function removeMember(member: Member) {
    if (!supabase || !isOwner) return;
    if (!window.confirm("Remove this person from the workspace? They will lose access to its business records.")) return;
    setBusyId(member.id); setError(""); setNotice("");
    const { error: actionError } = await supabase.rpc("remove_workspace_member", { p_membership_id: member.id });
    if (actionError) setError(actionError.message);
    else { setNotice("Team member removed from this workspace."); await loadMembers(); }
    setBusyId("");
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !isOwner || !inviteEmail.trim()) return;
    setBusyId("invite"); setError(""); setNotice("");
    const { data, error: inviteError } = await supabase.functions.invoke("team-invitations", {
      body: { action: "invite", workspaceId, email: inviteEmail.trim(), role: inviteRole },
    });
    if (inviteError || data?.error) {
      setError(data?.error || inviteError?.message || "Could not send invitation.");
    } else {
      setNotice(data?.message || "Invitation created.");
      if (data?.acceptUrl && typeof navigator !== "undefined" && navigator.clipboard) {
        try { await navigator.clipboard.writeText(data.acceptUrl); setNotice("Invitation link copied. Share it with the invited person."); }
        catch { setNotice("Invitation link created. Copy it from the pending invitation below."); }
      }
      setInviteEmail("");
      await loadInvitations();
    }
    setBusyId("");
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!supabase || !isOwner) return;
    setBusyId(invitation.id); setError(""); setNotice("");
    const { data, error: actionError } = await supabase.functions.invoke("team-invitations", {
      body: { action: "revoke", invitationId: invitation.id },
    });
    if (actionError || data?.error) setError(data?.error || actionError?.message || "Could not revoke invitation.");
    else { setNotice("Invitation revoked."); await loadInvitations(); }
    setBusyId("");
  }

  async function copyInvitation(invitation: Invitation) {
    const url = new URL("/invite", window.location.origin);
    url.searchParams.set("invitation", invitation.id);
    try { await navigator.clipboard.writeText(url.toString()); setNotice("Invitation link copied."); }
    catch { setError("Could not copy the link. Please copy the invitation URL manually."); }
  }

  return (
    <div className="space-y-4">
      <section className="subtle-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf7f0] text-[#16865b]"><Users size={19}/></span>
            <div><h2 className="text-[14px] font-bold">Workspace team</h2><p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[#89938d]">Owners manage invitations and roles. Managers can view the team and manage day-to-day business records. Employees can view records and work on tasks.</p></div>
          </div>
          <button onClick={() => { void loadMembers(); void loadInvitations(); }} className="action-button" disabled={loading}><RefreshCw size={13}/>Refresh</button>
        </div>
      </section>
      {error && <div role="alert" className="rounded-lg border border-[#f0d9d9] bg-[#fff6f6] px-4 py-3 text-[12px] text-[#a33d3d]">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-[#dcece1] bg-[#f1f8f3] px-4 py-3 text-[12px] text-[#326448]">{notice}</div>}

      <section className="subtle-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#edf0ee] px-5 py-4">
          <div><h3 className="text-[13px] font-bold">Members</h3><p className="mt-1 text-[10px] text-[#929c95]">{canSeeTeam ? members.length + " people with workspace access" : "Your workspace membership"}</p></div>
          <span className="rounded-full bg-[#f2f6f3] px-2.5 py-1 text-[10px] font-semibold text-[#53715e]">{myRole}</span>
        </div>
        {loading ? <div className="flex min-h-[120px] items-center justify-center gap-2 text-[11px] text-[#89938d]"><LoaderCircle size={15} className="animate-spin"/>Loading team...</div> :
          members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f3f1] px-5 py-4 last:border-0">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf2ee] text-[11px] font-bold text-[#53645a]">{member.user_id === currentUserId ? "You" : member.user_id.slice(0,2).toUpperCase()}</span>
                <div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#46534b]">{member.user_id === currentUserId ? "Your account" : "Team member " + member.user_id.slice(0,8)}</p><p className="mt-1 text-[10px] text-[#929c95]">Joined {new Date(member.created_at).toLocaleDateString(undefined, {day:"numeric",month:"short",year:"numeric"})}</p></div>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && member.role !== "owner" && member.role !== "admin" ? <>
                  <select aria-label="Member role" value={member.role === "manager" ? "manager" : "employee"} disabled={busyId === member.id} onChange={(event) => void changeRole(member, event.target.value as "manager" | "employee")} className="rounded-lg border border-[#e9eeeb] bg-transparent px-2 py-2 text-[10px] capitalize"><option value="employee">Employee</option><option value="manager">Manager</option></select>
                  <button title="Remove member" aria-label="Remove member" disabled={busyId === member.id} onClick={() => void removeMember(member)} className="rounded-lg border border-[#f0d9d9] p-2 text-[#a65a5a] disabled:opacity-50"><UserMinus size={14}/></button>
                </> : <span className="inline-flex items-center gap-1 rounded-full bg-[#f3f6f4] px-2.5 py-1 text-[10px] capitalize text-[#617068]">{member.role === "owner" || member.role === "admin" ? <ShieldCheck size={12}/> : null}{member.role}</span>}
                {busyId === member.id && <LoaderCircle size={13} className="animate-spin"/>}
              </div>
            </div>
          ))
        }
        {!loading && members.length === 0 && <div className="px-5 py-10 text-center text-[11px] text-[#929c95]">No team members are visible to this account.</div>}
      </section>

      {isOwner && <section className="subtle-card p-5">
        <div className="flex items-center gap-2"><MailPlus size={16} className="text-[#16865b]"/><h3 className="text-[13px] font-bold">Invite a team member</h3></div>
        <form onSubmit={inviteMember} className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
          <label className="text-[11px] font-semibold text-[#526057]">Email address<input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="colleague@example.com" className="field"/></label>
          <label className="text-[11px] font-semibold text-[#526057]">Role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "manager" | "employee")} className="field"><option value="employee">Employee</option><option value="manager">Manager</option></select></label>
          <button disabled={busyId === "invite"} className="primary-button self-end">{busyId === "invite" ? <LoaderCircle size={14} className="animate-spin"/> : <MailPlus size={14}/>}Send invite</button>
        </form>
        <p className="mt-2 text-[10px] text-[#929c95]">Invitations expire after 7 days. If the email already has an account, a secure sign-in link is provided for sharing.</p>
      </section>}

      {isOwner && <section className="subtle-card overflow-hidden">
        <div className="border-b border-[#edf0ee] px-5 py-4"><h3 className="text-[13px] font-bold">Invitations</h3><p className="mt-1 text-[10px] text-[#929c95]">Recent invitations and their status.</p></div>
        {invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f3f1] px-5 py-3 last:border-0">
          <div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#46534b]">{invitation.email}</p><p className="mt-1 text-[10px] text-[#929c95]">{invitation.role} · expires {new Date(invitation.expires_at).toLocaleDateString()}</p></div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-[#f3f6f4] px-2.5 py-1 text-[10px] capitalize text-[#617068]">{invitation.status}</span>{invitation.status === "pending" && <><button title="Copy invitation link" aria-label="Copy invitation link" onClick={() => void copyInvitation(invitation)} className="rounded-lg border border-[#e9eeeb] p-2 text-[#69756e]"><Copy size={13}/></button><button title="Revoke invitation" aria-label="Revoke invitation" disabled={busyId === invitation.id} onClick={() => void revokeInvitation(invitation)} className="rounded-lg border border-[#f0d9d9] p-2 text-[#a65a5a]"><XCircle size={13}/></button></>}</div>
        </div>)}
        {invitations.length === 0 && <div className="px-5 py-8 text-center text-[11px] text-[#929c95]">No invitations yet.</div>}
      </section>}
    </div>
  );
}
