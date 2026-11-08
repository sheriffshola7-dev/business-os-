"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, ShieldCheck, UserMinus, Users } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Member = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type Props = {
  supabase: SupabaseClient<Database> | null;
  workspaceId: string;
  currentUserId: string;
};

export default function TeamManagement({ supabase, workspaceId, currentUserId }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [myRole, setMyRole] = useState("employee");

  const loadMembers = useCallback(async () => {
    if (!supabase || !workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("workspace_members")
      .select("id,user_id,role,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (queryError) {
      setError(queryError.message);
      setMembers([]);
    } else {
      const rows = (data || []) as Member[];
      setMembers(rows);
      setMyRole(rows.find((member) => member.user_id === currentUserId)?.role || "employee");
    }
    setLoading(false);
  }, [supabase, workspaceId, currentUserId]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const isOwner = myRole === "owner" || myRole === "admin";
  const canSeeTeam = isOwner || myRole === "manager";

  async function changeRole(member: Member, role: "manager" | "employee") {
    if (!supabase || !isOwner) return;
    setBusyId(member.id);
    setError("");
    setNotice("");
    const { error: actionError } = await supabase.rpc("change_workspace_member_role", {
      p_membership_id: member.id,
      p_new_role: role,
    });
    if (actionError) setError(actionError.message);
    else {
      setNotice("Team member role updated.");
      await loadMembers();
    }
    setBusyId("");
  }

  async function removeMember(member: Member) {
    if (!supabase || !isOwner) return;
    const confirmed = window.confirm("Remove this person from the workspace? They will lose access to its business records.");
    if (!confirmed) return;
    setBusyId(member.id);
    setError("");
    setNotice("");
    const { error: actionError } = await supabase.rpc("remove_workspace_member", {
      p_membership_id: member.id,
    });
    if (actionError) setError(actionError.message);
    else {
      setNotice("Team member removed from this workspace.");
      await loadMembers();
    }
    setBusyId("");
  }

  return (
    <div className="space-y-4">
      <section className="subtle-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf7f0] text-[#16865b]"><Users size={19}/></span>
            <div>
              <h2 className="text-[14px] font-bold">Workspace team</h2>
              <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[#89938d]">Manage access for people who work in this business. Owners control roles and membership; managers can view the team.</p>
            </div>
          </div>
          <button onClick={() => void loadMembers()} className="action-button" disabled={loading}><RefreshCw size={13}/>Refresh</button>
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
                <div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#46534b]">{member.user_id === currentUserId ? "Your account" : "Team member " + member.user_id.slice(0,8)}</p><p className="mt-1 text-[10px] text-[#929c95]">Joined {new Date(member.created_at).toLocaleDateString("en-NG", {day:"numeric",month:"short",year:"numeric"})}</p></div>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && member.role !== "owner" && member.role !== "admin" ? <>
                  <select aria-label="Member role" value={member.role === "manager" ? "manager" : "employee"} disabled={busyId === member.id} onChange={(event) => void changeRole(member, event.target.value as "manager" | "employee")} className="rounded-lg border border-[#e9eeeb] bg-transparent px-2 py-2 text-[10px] capitalize">
                    <option value="employee">Employee</option><option value="manager">Manager</option>
                  </select>
                  <button title="Remove member" aria-label="Remove member" disabled={busyId === member.id} onClick={() => void removeMember(member)} className="rounded-lg border border-[#f0d9d9] p-2 text-[#a65a5a] disabled:opacity-50"><UserMinus size={14}/></button>
                </> : <span className="inline-flex items-center gap-1 rounded-full bg-[#f3f6f4] px-2.5 py-1 text-[10px] capitalize text-[#617068]">{member.role === "owner" || member.role === "admin" ? <ShieldCheck size={12}/> : null}{member.role}</span>}
                {busyId === member.id && <LoaderCircle size={13} className="animate-spin"/>}
              </div>
            </div>
          ))
        }
        {!loading && members.length === 0 && <div className="px-5 py-10 text-center text-[11px] text-[#929c95]">No team members are visible to this account.</div>}
      </section>

      <section className="subtle-card p-5">
        <h3 className="text-[13px] font-bold">Invitations</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[#89938d]">Email invitations are not enabled yet. They need a protected server-side Supabase Auth key; no secret key is currently configured in the hosting environment. This section will become active after that secure setup.</p>
        <span className="mt-3 inline-flex rounded-full bg-[#fff5e9] px-2.5 py-1 text-[10px] font-semibold text-[#a66b2e]">Invitation setup pending</span>
      </section>
    </div>
  );
}
