"use client";

import { useEffect } from "react";

/**
 * The portal's own error boundary.
 *
 * The boundary in src/app/error.tsx sits above the streamed shell: by the time
 * a server render fails, the layout and any loading.tsx skeleton have already
 * been sent, so the person on screen can be left with a skeleton that never
 * resolves instead of an error they can read. This boundary lives inside the
 * portal segment, next to those skeletons, so the failure replaces the page
 * area and keeps a route back into the portal.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] screen failed to render", error.digest ?? "", error.message);
  }, [error]);

  // The first line only: Postgres errors carry the statement and a CONTEXT
  // block, and none of that helps the person reading it.
  const detail = (error.message || "The screen failed to render.").split("\n")[0];

  return (
    <main className="grid min-h-[60vh] place-items-center p-4">
      <section className="w-full max-w-lg rounded-xl border border-line bg-card p-6 shadow-card">
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          This screen could not be loaded
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          The page failed while reading from the database. Nothing was changed — a failed read
          saves nothing. Try again, and if it keeps happening quote the reference below to a
          manager.
        </p>
        <p className="mt-3 max-w-full break-words rounded-lg bg-canvas px-3 py-2 font-mono text-xs text-ink-soft">
          {detail}
        </p>
        {error.digest ? (
          <p className="mt-1 font-mono text-xs text-ink-soft/70">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-lg bg-flame-600 px-4 text-sm font-semibold text-white hover:bg-flame-700"
          >
            Try again
          </button>
          <a
            href="/"
            className="grid h-10 place-items-center rounded-lg border border-line px-4 text-sm font-semibold text-ink hover:bg-canvas"
          >
            Back to dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
