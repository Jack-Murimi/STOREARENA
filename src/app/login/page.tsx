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
  const [showPassword, setShowPassword] = useState(false);

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
    /*
     * Full-screen background: dark warm tone (#1c1917) with a subtle
     * orange radial glow behind the card so the background has character
     * without competing with the form.
     */
    <div
      className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center px-4 py-12 bg-bg"
    >
      {/* Background glow — purely decorative */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(249,115,22,0.09) 0%, transparent 65%)",
        }}
      />

      {/* Subtle dot-grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* ── Brand mark above card ── */}
      <div className="relative mb-8 flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 shadow-lg shadow-orange-500/30">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2c-1.5 3-4 4.5-4 8a4 4 0 0 0 8 0c0-1.5-.5-2.5-1-3.5C14.5 8 14 9.5 13 10c0-2-1-5-1-8Z"
              fill="white"
              opacity="0.95"
            />
            <path
              d="M9 15.5C9 17.43 10.34 19 12 19s3-1.57 3-3.5c0-1-.4-1.8-.8-2.4C13.8 14 13 15 12 15c0-1-.5-2-.5-2C10.2 13.5 9 14.4 9 15.5Z"
              fill="white"
              opacity="0.65"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-white">Gateway Gas Enterprises</p>
          <p className="mt-0.5 text-xs text-[#a8a29e]">Staff Portal</p>
        </div>
      </div>

      {/* ── Card ── */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface px-8 py-8 shadow-raised"
      >
        {/* Card heading */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-ink">Sign in</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Use your Gateway Gas staff account
          </p>
        </div>

        {/* Google SSO */}
        <button
          onClick={signInWithGoogle}
          disabled={googlePending || pending}
          type="button"
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
          </svg>
          {googlePending ? "Redirecting…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-ink-subtle">or with email</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Email / password form */}
        <form onSubmit={submit} noValidate className="space-y-4">
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
              placeholder="you@gatewaygas.com"
              className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors duration-150 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-ink">
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs font-medium text-orange-700 hover:underline focus:outline-none focus-visible:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                required
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 pr-11 text-sm text-ink placeholder:text-ink-subtle transition-colors duration-150 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
              {/* Eye toggle */}
              <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 flex h-11 w-11 cursor-pointer items-center justify-center text-ink-subtle transition-colors duration-150 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 rounded-lg"
            >
              {/* Animated eye SVG — morphs pupil and lid on toggle */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="overflow-visible"
              >
                {/* Outer eye shape */}
                <path
                  d="M1 12C1 12 5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  className="transition-all duration-300"
                />
                {/* Pupil — shrinks to a dot when hidden */}
                <circle
                  cx="12"
                  cy="12"
                  r={showPassword ? 3 : 0.5}
                  fill="currentColor"
                  className="transition-all duration-300 ease-in-out"
                />
                {/* Slash line — appears when hidden */}
                <line
                  x1={showPassword ? "12" : "4"}
                  y1={showPassword ? "12" : "4"}
                  x2={showPassword ? "12" : "20"}
                  y2={showPassword ? "12" : "20"}
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  opacity={showPassword ? 0 : 1}
                  className="transition-all duration-300 ease-in-out"
                />
              </svg>
            </button>
            </div>
          </div>

          {message ? (
            <div role="alert" className="rounded-lg border border-critical/20 bg-critical/10 px-3 py-2.5">
              <p className="text-sm text-critical">{message}</p>
            </div>
          ) : null}

          <button
            disabled={pending || googlePending}
            type="submit"
            className="h-11 w-full cursor-pointer rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="relative mt-8 text-center text-[11px] text-[#57534e]">
        Gateway Gas Enterprises &mdash; Authorised staff only
      </p>
    </div>
  );
}
