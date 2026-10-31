"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    let navigating = false;
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage("Email or password is incorrect.");
      } else {
        const next =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("next")
            : null;
        const target =
          next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        navigating = true;
        window.location.assign(target);
      }
    } catch {
      setMessage(
        "Sign-in is not configured yet. Ask an administrator to complete Supabase setup."
      );
    } finally {
      if (!navigating) setPending(false);
    }
  }

  async function signInWithGoogle() {
    setGooglePending(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const next =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      const redirectTo = `${appUrl}/auth/callback${next && next.startsWith("/") && !next.startsWith("//") ? `?next=${encodeURIComponent(next)}` : ""}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) setMessage("Google sign-in failed. Try again.");
    } catch {
      setMessage("Google sign-in is not configured. Contact an administrator.");
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface-sunken p-4">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-raised">
        <p className="text-sm font-semibold text-orange-700">
          Gateway Gas Enterprises
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Use the password you chose from your secure invitation email.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Email</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink">Password</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
            />
          </label>
          <div className="flex justify-end">
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-orange-700 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          {message ? (
            <p role="alert" className="text-sm text-critical">
              {message}
            </p>
          ) : null}
          <button
            disabled={pending}
            type="submit"
            className="h-11 w-full rounded-md bg-orange-500 px-4 text-sm font-semibold text-ink disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-ink-muted">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={googlePending}
          type="button"
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
              fill="#EA4335"
            />
          </svg>
          {googlePending ? "Redirecting…" : "Sign in with Google"}
        </button>
      </section>
    </main>
  );
}
