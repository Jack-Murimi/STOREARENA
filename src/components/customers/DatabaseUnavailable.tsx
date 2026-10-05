/**
 * Shown when no database can be reached.
 *
 * This exists so a missing or wrong DATABASE_URL produces a screen that says
 * what to do, instead of a crashed serverless function.
 */
export function DatabaseUnavailable({ notice }: { notice: string | null }) {
  return (
    <section className="overflow-hidden rounded-xl border border-warn/30 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">
          No database connection
        </h2>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">
          The customer screens need Supabase. Nothing is broken in the app — it
          just has nowhere to read from yet.
        </p>
      </div>

      <div className="space-y-4 p-5 text-[13px] text-ink-soft">
        {notice ? (
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-warn">
            {notice}
          </p>
        ) : null}

        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open your Supabase project → <strong>Connect</strong> →{" "}
            <strong>Transaction pooler</strong>, and copy the URI. It looks like
            <code className="mx-1 rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px]">
              postgresql://postgres.&lt;project-ref&gt;:&lt;password&gt;@aws-1-&lt;region&gt;.pooler.supabase.com:6543/postgres
            </code>
          </li>
          <li>
            On Netlify: <strong>Site configuration → Environment variables</strong>,
            add <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px]">DATABASE_URL</code>{" "}
            with that URI plus <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px]">?sslmode=require</code>,
            then <strong>redeploy</strong>. Locally it goes in{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px]">.env.local</code>.
          </li>
          <li>
            Create the tables once: paste{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px]">
              src/lib/customers/schema.sql
            </code>{" "}
            into Supabase → SQL Editor and run it. It is safe to run more than
            once.
          </li>
        </ol>

        <p className="text-[12.5px]">
          Use the <strong>pooler</strong> host, not{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px]">
            db.&lt;project-ref&gt;.supabase.co
          </code>
          : serverless functions are short-lived, and the pooler is built for
          them.
        </p>
      </div>
    </section>
  );
}
