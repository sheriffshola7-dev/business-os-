import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("APP_URL") ?? "https://business-os-wokg.netlify.app";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return response(500, { error: "Invitation service is not configured." });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response(401, { error: "Sign in first." });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response(401, { error: "Your session is invalid. Sign in again." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { action?: string; workspaceId?: string; email?: string; role?: string; invitationId?: string };
  try { body = await req.json(); } catch { return response(400, { error: "Invalid request body." }); }

  if (body.action === "invite") {
    const workspaceId = body.workspaceId ?? "";
    const email = (body.email ?? "").trim().toLowerCase();
    const role = body.role ?? "";
    if (!workspaceId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["manager", "employee"].includes(role)) {
      return response(400, { error: "Enter a valid email and choose Manager or Employee." });
    }

    const { data: membership, error: membershipError } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return response(403, { error: "Only workspace owners can invite team members." });
    }

    const { data: invitation, error: insertError } = await admin
      .from("workspace_invitations")
      .insert({ workspace_id: workspaceId, email, role, invited_by: userData.user.id })
      .select("id, expires_at")
      .single();
    if (insertError) {
      return response(insertError.code === "23505" ? 409 : 400, {
        error: insertError.code === "23505" ? "A pending invitation already exists for this email." : insertError.message,
      });
    }

    const acceptUrl = new URL("/invite", appUrl);
    acceptUrl.searchParams.set("invitation", invitation.id);
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: acceptUrl.toString(),
      data: { workspace_invitation_id: invitation.id },
    });

    if (inviteError) {
      // Keep the invitation available for an existing account to accept after sign-in.
      const alreadyRegistered = /already|registered|exists/i.test(inviteError.message);
      if (alreadyRegistered) {
        return response(200, {
          invitationId: invitation.id,
          acceptUrl: acceptUrl.toString(),
          expiresAt: invitation.expires_at,
          delivery: "share_link",
          message: "This email already has an account. Share the secure invitation link with the person; they must sign in with the invited email to accept.",
        });
      }
      await admin.from("workspace_invitations").delete().eq("id", invitation.id);
      return response(502, { error: "The invitation email could not be sent. Check Supabase Auth email delivery settings.", detail: inviteError.message });
    }

    return response(200, {
      invitationId: invitation.id,
      expiresAt: invitation.expires_at,
      delivery: "email",
      message: "Invitation email sent.",
    });
  }

  if (body.action === "accept") {
    const invitationId = body.invitationId ?? "";
    const email = (userData.user.email ?? "").toLowerCase();
    if (!invitationId || !email) return response(400, { error: "Invitation and signed-in email are required." });
    const { data: invitation, error: invitationError } = await admin
      .from("workspace_invitations")
      .select("id,workspace_id,email,role,status,expires_at,accepted_by")
      .eq("id", invitationId)
      .maybeSingle();
    if (invitationError || !invitation) return response(404, { error: "Invitation not found." });
    if (invitation.status === "accepted" && invitation.accepted_by === userData.user.id) {
      return response(200, { accepted: true, workspaceId: invitation.workspace_id });
    }
    if (invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
      return response(410, { error: "This invitation has expired or is no longer active." });
    }
    if (invitation.email.toLowerCase() !== email) {
      return response(403, { error: "Sign in with the email address this invitation was sent to." });
    }
    const { error: memberError } = await admin.from("workspace_members").upsert(
      { workspace_id: invitation.workspace_id, user_id: userData.user.id, role: invitation.role },
      { onConflict: "workspace_id,user_id", ignoreDuplicates: true },
    );
    if (memberError) return response(500, { error: "Could not add you to the workspace." });
    const { error: updateError } = await admin.from("workspace_invitations")
      .update({ status: "accepted", accepted_by: userData.user.id })
      .eq("id", invitation.id)
      .eq("status", "pending");
    if (updateError) return response(500, { error: "Membership was created but invitation status could not be updated." });
    return response(200, { accepted: true, workspaceId: invitation.workspace_id });
  }

  if (body.action === "revoke") {
    const invitationId = body.invitationId ?? "";
    const { data: invitation } = await admin.from("workspace_invitations")
      .select("id,workspace_id,status").eq("id", invitationId).maybeSingle();
    if (!invitation) return response(404, { error: "Invitation not found." });
    const { data: membership } = await admin.from("workspace_members")
      .select("role").eq("workspace_id", invitation.workspace_id).eq("user_id", userData.user.id).maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return response(403, { error: "Only workspace owners can revoke invitations." });
    }
    const { error: revokeError } = await admin.from("workspace_invitations")
      .update({ status: "revoked" }).eq("id", invitationId).eq("status", "pending");
    if (revokeError) return response(500, { error: "Could not revoke invitation." });
    return response(200, { revoked: true });
  }

  return response(400, { error: "Unknown action." });
});
