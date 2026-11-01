"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/auth/callback?next=/auth/set-password`,
      });
      if (error) {
        setError("Could not send reset email. Check the address and try again.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
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

        <div className="rounded-xl border border-border bg-surface shadow-raised p-6">
          {done ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ok/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ok"/>
                </svg>
              </div>
              <h2 className="text-base font-semibold text-ink">Check your inbox</h2>
              <p className="mt-2 text-sm text-ink-muted">
                If that email has an account, a password-reset link has been sent.
                Follow the link to choose a new password.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-block text-sm font-medium text-orange-700 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-ink">Reset your password</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              <form onSubmit={submit} className="mt-5 space-y-4">
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

                {error ? (
                  <div role="alert" className="rounded-lg bg-critical/10 border border-critical/20 px-3 py-2.5">
                    <p className="text-sm text-critical">{error}</p>
                  </div>
                ) : null}

                <button
                  disabled={pending}
                  type="submit"
                  className="h-11 w-full rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                >
                  {pending ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-ink-muted">
                <Link href="/login" className="font-medium text-orange-700 hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-subtle">
          Gateway Gas Enterprises &mdash; Staff only
        </p>
      </div>
    </div>
  );
}
