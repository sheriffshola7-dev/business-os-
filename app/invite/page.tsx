"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CheckCircle2, LoaderCircle, LogIn } from "lucide-react";

export default function AcceptInvitationPage() {
  const [status, setStatus] = useState<"loading" | "signed_out" | "accepted" | "error">("loading");
  const [message, setMessage] = useState("Checking your invitation...");
  const [workspaceId, setWorkspaceId] = useState("");

  useEffect(() => {
    const invitationId = new URLSearchParams(window.location.search).get("invitation") || "";
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setStatus("error"); setMessage("Business OS is not connected to Supabase. Please contact the workspace owner."); return; }
    const client = supabase;
    let active = true;
    let running = false;

    async function accept() {
      if (running || !invitationId) return;
      running = true;
      const { data: sessionData } = await client.auth.getSession();
      if (!active) return;
      if (!sessionData.session) {
        setStatus("signed_out");
        setMessage("Sign in with the email address this invitation was sent to, then open this invitation link again.");
        running = false;
        return;
      }
      const { data, error } = await client.functions.invoke("team-invitations", {
        body: { action: "accept", invitationId },
      });
      if (!active) return;
      if (error || data?.error) {
        setStatus("error");
        setMessage(data?.error || error?.message || "We could not accept this invitation.");
      } else {
        setWorkspaceId(data.workspaceId);
        setStatus("accepted");
        setMessage("You have joined the workspace. Continue to Business OS to access it.");
      }
    }

    if (!invitationId) {
      setStatus("error");
      setMessage("This invitation link is missing its invitation code.");
    } else {
      void accept();
    }
    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void accept();
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  function continueToWorkspace() {
    window.location.href = workspaceId ? "/?workspace=" + encodeURIComponent(workspaceId) : "/";
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f5f7f5] px-5 py-10">
    <section className="w-full max-w-md rounded-2xl border border-[#e8ede9] bg-white p-7 text-center shadow-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#edf7f0] text-[#16865b]">
        {status === "loading" ? <LoaderCircle size={22} className="animate-spin"/> : status === "accepted" ? <CheckCircle2 size={22}/> : <LogIn size={22}/>}
      </div>
      <h1 className="mt-5 text-xl font-bold text-[#27332b]">Business OS invitation</h1>
      <p className="mt-3 text-sm leading-6 text-[#718078]">{message}</p>
      {status === "signed_out" && <Link href="/?auth=login" className="primary-button mt-6 inline-flex">Go to sign in</Link>}
      {status === "accepted" && <button onClick={continueToWorkspace} className="primary-button mt-6">Continue to workspace</button>}
      {status === "error" && <Link href="/" className="action-button mt-6 inline-flex">Return to Business OS</Link>}
    </section>
  </main>;
}
