import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentStaffAccess } from "@/lib/auth";
import { getCustomerContext } from "@/lib/db";

/**
 * The authorisation gate for every portal screen.
 *
 * Middleware only proves a Supabase session exists. That is not the same as
 * being a member of staff: an invited account whose app_users row was never
 * written, or a person who has left and been deactivated, still holds a valid
 * session. Before this layout existed, `AppShell` quietly fell back to the
 * "Signed out" placeholder and the page went on rendering customer names,
 * balances and sales to that session.
 *
 * Three outcomes:
 *   - no session               -> /login
 *   - no database              -> an explanatory screen (it is not "no access")
 *   - session but no live staff -> /no-access
 *
 * Redirecting the last case to /login would loop: middleware sends an
 * authenticated visitor on /login straight back to "/".
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  // currentStaffAccess is request-cached and verifies both session and staff record.
  const [{ products, notice, diagnostic }, staff] = await Promise.all([
    getCustomerContext(),
    currentStaffAccess(),
  ]);

  // A database outage must not be reported as "you are not staff": that would
  // send a legitimate manager to a page telling them their account was
  // deactivated, and hide the real cause from whoever is on call.
  if (!products) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface-sunken p-4">
        <section className="w-full max-w-lg rounded-lg border border-warn bg-surface p-6 shadow-raised">
          <h1 className="text-xl font-semibold text-ink">The portal cannot reach its database</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {notice ?? "No database connection is configured."}
          </p>
          {diagnostic ? (
            <p className="mt-2 rounded-md bg-surface-muted px-3 py-2 font-mono text-xs break-words text-ink-subtle">
              {diagnostic}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-ink-muted">
            Nothing has been lost. Once the connection is restored, reload this page.
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

  if (!staff) redirect("/no-access");
  if (staff.role === "rider") redirect("/rider");

  return children;
}
