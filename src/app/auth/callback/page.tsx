"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Handles three flows:
 *  - Google OAuth: Supabase redirects here with a one-time `code`
 *  - Invitation email: PKCE `code` + `?next=/auth/set-password`
 *  - Password reset email: PKCE `code` + `?next=/auth/set-password`
 *  - Implicit hash flow (legacy): session in URL hash
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const finish = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const next = params.get("next");
        const destination =
          next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

        if (code) {
          // If there's already a valid session (e.g. user clicked Google sign-in
          // again), skip the exchange — the code is one-time-use.
          const { data: { session: existing } } = await supabase.auth.getSession();
          if (!existing) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          }
        }

        // Let implicit hash exchange complete (one frame is enough).
        await new Promise((resolve) => window.setTimeout(resolve, 80));

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("No session.");
        if (!cancelled) router.replace(destination);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void finish();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-surface-sunken p-4">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-raised">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-ink">Link expired</h1>
            <p className="mt-2 text-sm text-ink-muted">
              This link has expired or was already used. Ask an Admin for a new
              one, or try{" "}
              <a href="/login" className="font-medium text-orange-700 hover:underline">
                signing in
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-border border-t-orange-500" />
            <h1 className="text-xl font-semibold text-ink">Signing you in…</h1>
            <p className="mt-2 text-sm text-ink-muted">
              Please wait while we verify your credentials.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
