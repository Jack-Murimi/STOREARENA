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
    <main className="grid min-h-screen place-items-center bg-surface-sunken p-4">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-raised">
        <p className="text-sm font-semibold text-orange-700">
          Gateway Gas Enterprises
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">
          Reset your password
        </h1>
        {done ? (
          <p className="mt-4 text-sm text-ink-muted">
            If that email has an account, a password-reset link has been sent.
            Check your inbox and follow the link to choose a new password.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              Enter your email and we will send you a link to set a new
              password.
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
                  className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink"
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-critical">
                  {error}
                </p>
              ) : null}
              <button
                disabled={pending}
                type="submit"
                className="h-11 w-full rounded-md bg-orange-500 px-4 text-sm font-semibold text-ink disabled:opacity-50"
              >
                {pending ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p className="mt-4 text-center text-sm text-ink-muted">
          <Link href="/login" className="font-medium text-orange-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
