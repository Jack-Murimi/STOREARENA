"use client";

import { useEffect } from "react";

/**
 * The last line of defence for a server render that throws.
 *
 * Without a boundary, Next shows its default error page: a stack trace in
 * development and an unhelpful "Application error" in production, with no way
 * back into the portal. This one keeps the staff member oriented and logs the
 * digest so a report can be matched to the server log.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] render failed", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-surface-sunken p-4">
      <section className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-raised">
        <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This screen could not be loaded. Nothing was saved by the failed request. Try
          again, and if it keeps happening quote the reference below to a manager.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-md bg-surface-muted px-3 py-2 font-mono text-xs text-ink-subtle">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-md bg-flame-500 px-4 text-sm font-semibold text-white hover:bg-flame-600"
          >
            Try again
          </button>
          <a
            href="/"
            className="grid h-10 place-items-center rounded-md border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
          >
            Back to dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
