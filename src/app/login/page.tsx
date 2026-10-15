"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setPending(true); setMessage(""); try { const supabase = createSupabaseBrowserClient(); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage("Email or password is incorrect."); else router.replace("/"); } catch { setMessage("Sign-in is not configured yet. Ask an administrator to complete Supabase setup."); } finally { setPending(false); } }
  return <main className="grid min-h-screen place-items-center bg-surface-sunken p-4"><section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-raised"><p className="text-sm font-semibold text-orange-700">Gateway Gas Enterprises</p><h1 className="mt-2 text-2xl font-semibold text-ink">Sign in</h1><p className="mt-1 text-sm text-ink-muted">Use the password you chose from your secure invitation email.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block space-y-1"><span className="text-sm font-medium text-ink">Email</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label><label className="block space-y-1"><span className="text-sm font-medium text-ink">Password</span><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label>{message ? <p role="alert" className="text-sm text-critical">{message}</p> : null}<button disabled={pending} type="submit" className="h-11 w-full rounded-md bg-orange-500 px-4 text-sm font-semibold text-ink disabled:opacity-50">{pending ? "Signing in…" : "Sign in"}</button></form></section></main>;
}
