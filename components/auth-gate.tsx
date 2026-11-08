"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, LoaderCircle, LogOut, LockKeyhole, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Props = { children: ReactNode };

export default function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const supabase = createSupabaseBrowserClient();

  const ensureWorkspace = useCallback(async (currentUser: User) => {
    if (!supabase) throw new Error("Supabase is not configured yet.");

    // First reuse an existing membership. This keeps repeat logins idempotent.
    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", currentUser.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (membership?.workspace_id) return;

    // Recover older accounts that have an owned workspace but no membership row.
    const { data: existingWorkspace, error: existingWorkspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("created_by", currentUser.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingWorkspaceError) throw existingWorkspaceError;

    let workspaceId = existingWorkspace?.id;

    if (!workspaceId) {
      const workspaceName =
        currentUser.user_metadata?.business_name?.toString().trim() || "My Business";

      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .insert({ name: workspaceName.slice(0, 120), created_by: currentUser.id })
        .select("id")
        .single();

      if (workspaceError) throw workspaceError;
      workspaceId = workspace.id;
    }

    const { error: memberError } = await supabase.from("workspace_members").insert({
      workspace_id: workspaceId,
      user_id: currentUser.id,
      role: "owner",
    });

    // If another tab completed the same repair first, confirm the membership
    // exists instead of showing a misleading setup error.
    if (memberError) {
      const { data: confirmedMembership, error: confirmError } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", currentUser.id)
        .limit(1)
        .maybeSingle();

      if (confirmError) throw confirmError;
      if (confirmedMembership?.workspace_id) return;
      throw memberError;
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let alive = true;
    supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (!alive) return;
      if (authError) setError(authError.message);
      if (data.user) {
        try {
          await ensureWorkspace(data.user);
          if (alive) setUser(data.user);
        } catch (workspaceError) {
          if (alive) setError(workspaceError instanceof Error ? workspaceError.message : "Could not prepare your business workspace.");
        }
      }
      if (alive) setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      // SIGNED_IN is intentionally handled by the sign-in/signup flow above,
      // after ensureWorkspace finishes. Setting the user here caused the
      // dashboard to mount before the membership row was ready.
      if (event === "SIGNED_OUT") setUser(null);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [ensureWorkspace, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError("Supabase environment variables are not configured."); return; }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { business_name: businessName.trim() || "My Business" },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session && data.user) {
          await ensureWorkspace(data.user);
          setUser(data.user);
        } else {
          setMessage("Account created. Check your email to confirm your address, then sign in.");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        if (data.user) {
          await ensureWorkspace(data.user);
          setUser(data.user);
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7f5] p-5 text-[#26342b]">
        <section className="w-full max-w-lg rounded-2xl border border-[#e5ebe6] bg-white p-7 shadow-sm">
          <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[#eaf5ed] text-[#16865b]"><BriefcaseBusiness size={21}/></div>
          <h1 className="text-xl font-bold">Connect Business OS to Supabase</h1>
          <p className="mt-2 text-sm leading-6 text-[#718078]">The database is ready. Add these public environment variables to your deployment settings to enable account sign-in.</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-[#f5f7f5] p-4 text-xs leading-6">NEXT_PUBLIC_SUPABASE_URL=https://pqztjtwuvczfinjmdwjk.supabase.co{"\n"}NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key</pre>
          <p className="mt-3 text-xs text-[#8b9690]">Use the publishable key only. Never add a secret or service-role key to a NEXT_PUBLIC variable.</p>
        </section>
      </main>
    );
  }

  if (!ready) {
    return <main className="grid min-h-screen place-items-center bg-[#f5f7f5] text-[#16865b]"><LoaderCircle className="animate-spin" size={26}/></main>;
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7f5] p-4 text-[#26342b]">
        <section className="w-full max-w-[420px] rounded-2xl border border-[#e7ece8] bg-white p-7 shadow-[0_16px_50px_rgba(28,55,37,.07)] sm:p-9">
          <div className="mb-7 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#eaf5ed] text-[#16865b]"><BriefcaseBusiness size={21}/></div>
            <div><div className="text-lg font-bold tracking-tight">Business OS</div><div className="mt-0.5 text-[9px] font-bold tracking-[.16em] text-[#8b9690]">BY SHORLAH CLOUD</div></div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#16865b]">Build. Manage. Grow.</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
          <p className="mt-2 text-sm leading-6 text-[#7e8982]">{mode === "login" ? "Sign in to continue managing your business." : "Create an account to get your own private business workspace."}</p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "signup" && <label className="block text-xs font-semibold text-[#526057]">Business name<input value={businessName} onChange={e=>setBusinessName(e.target.value)} className="mt-2 w-full rounded-xl border border-[#e5ebe6] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#9ac7a8]" placeholder="e.g. Shorlah Company"/></label>}
            <label className="block text-xs font-semibold text-[#526057]">Email address<span className="relative mt-2 block"><Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa49e]"/><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border border-[#e5ebe6] bg-white py-3 pl-10 pr-3.5 text-sm outline-none focus:border-[#9ac7a8]" placeholder="you@example.com"/></span></label>
            <label className="block text-xs font-semibold text-[#526057]">Password<span className="relative mt-2 block"><LockKeyhole size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa49e]"/><input required minLength={8} type="password" autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-[#e5ebe6] bg-white py-3 pl-10 pr-3.5 text-sm outline-none focus:border-[#9ac7a8]" placeholder="At least 8 characters"/></span></label>
            {error && <p role="alert" className="rounded-lg border border-[#f1d8d8] bg-[#fff6f6] px-3 py-2.5 text-xs text-[#a33d3d]">{error}</p>}
            {message && <p role="status" className="rounded-lg border border-[#dcece1] bg-[#f1f8f3] px-3 py-2.5 text-xs text-[#326448]">{message}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16865b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#11734d] disabled:opacity-60">{busy&&<LoaderCircle size={16} className="animate-spin"/>}{mode==="login"?"Sign in":"Create account"}</button>
          </form>
          <p className="mt-6 text-center text-xs text-[#7e8982]">{mode==="login"?"New to Business OS?":"Already have an account?"} <button onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");setMessage("");}} className="font-semibold text-[#16865b]">{mode==="login"?"Create an account":"Sign in"}</button></p>
        </section>
      </main>
    );
  }

  return <><div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-xl border border-[#e5ebe6] bg-white/95 px-3 py-2 shadow-sm backdrop-blur"><span className="max-w-[150px] truncate text-[10px] font-medium text-[#65736a]">{user.email}</span><button onClick={signOut} title="Sign out" aria-label="Sign out" className="grid h-7 w-7 place-items-center rounded-lg text-[#758078] hover:bg-[#f1f5f2]"><LogOut size={14}/></button></div>{children}</>;
}
