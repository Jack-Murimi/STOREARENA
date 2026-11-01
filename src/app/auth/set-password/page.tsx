"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8 || password !== confirm) {
      setError("Use matching passwords of at least 8 characters.");
      return;
    }
    setPending(true);
    setError("");
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
    if (error) {
      setError("This invitation link has expired. Ask an Admin to send a new invitation.");
      setPending(false);
    } else {
      router.replace("/");
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
          <h2 className="text-base font-semibold text-ink">Set your password</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Choose a private password. It is not visible to your administrator.
          </p>

          <form onSubmit={save} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-ink">
                New password
              </label>
              <input
                id="password"
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm" className="block text-sm font-medium text-ink">
                Confirm password
              </label>
              <input
                id="confirm"
                required
                type="password"
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {pending ? "Saving…" : "Save password"}
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
