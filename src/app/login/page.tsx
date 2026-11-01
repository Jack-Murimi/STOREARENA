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
      const redirectTo = `${appUrl}/auth/callback${
        next && next.startsWith("/") && !next.startsWith("//")
          ? `?next=${encodeURIComponent(next)}`
          : ""
      }`;
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
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand header */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2C8 2 5 6 5 10c0 5 7 12 7 12s7-7 7-12c0-4-3-8-7-8Z" fill="white" opacity="0.9"/>
              <circle cx="12" cy="10" r="3" fill="white"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-ink">Gateway Gas Enterprises</h1>
          <p className="mt-1 text-sm text-ink-muted">Staff portal</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-surface shadow-raised p-6">

          {/* Google button — primary placement */}
          <button
            onClick={signInWithGoogle}
            disabled={googlePending || pending}
            type="button"
            className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            {googlePending ? "Redirecting…" : "Continue with Google"}
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-ink-muted">or sign in with email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Email/password form */}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-ink">
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-medium text-orange-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            {message ? (
              <div role="alert" className="rounded-lg bg-critical/10 border border-critical/20 px-3 py-2.5">
                <p className="text-sm text-critical">{message}</p>
              </div>
            ) : null}

            <button
              disabled={pending || googlePending}
              type="submit"
              className="h-11 w-full rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-ink-subtle">
          Gateway Gas Enterprises &mdash; Staff only
        </p>
      </div>
    </div>
  );
}
