import type { Metadata } from "next";

export const metadata: Metadata = { title: "No portal access" };
export const dynamic = "force-dynamic";

/**
 * Where a signed-in Supabase user lands when they have no live app_users row.
 *
 * The two causes are worth telling apart, because the fix is different:
 * a deactivated account needs an admin to reactivate it, an unprovisioned one
 * needs an admin to finish the invitation.
 */
export default function NoAccessPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-sunken p-4">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-raised">
        <h1 className="text-xl font-semibold text-ink">No portal access</h1>
        <p className="mt-2 text-sm text-ink-muted">
          You are signed in, but this account is not an active member of Gateway Gas
          staff. Either it has been deactivated, or the invitation was never finished.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Ask an administrator to check your role under <strong>Users</strong>.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button
            type="submit"
            className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
          >
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
