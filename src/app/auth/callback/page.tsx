"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Supabase invitation/recovery emails may return either a PKCE `code` query
 * parameter or an implicit-flow session in the URL hash. Hash fragments never
 * reach a Route Handler, so this must run in the browser.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Verifying your secure link…");

  useEffect(() => {
    let cancelled = false;
    const finish = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // createBrowserClient processes an implicit invite/recovery hash during
        // initialization. Waiting one frame lets that exchange complete.
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("No verified session was returned by the link.");
        if (!cancelled) router.replace("/auth/set-password");
      } catch {
        if (!cancelled) setMessage("This password link has expired or was already used. Ask an Admin for a new one.");
      }
    };
    void finish();
    return () => { cancelled = true; };
  }, [router]);

  return <main className="grid min-h-screen place-items-center bg-surface-sunken p-4"><section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-raised"><h1 className="text-xl font-semibold text-ink">Password setup</h1><p className="mt-2 text-sm text-ink-muted">{message}</p></section></main>;
}
