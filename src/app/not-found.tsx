import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found" };

/** A receipt number, customer or product that does not exist is a 404, not a crash. */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-sunken p-4">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-raised">
        <h1 className="text-xl font-semibold text-ink">Not found</h1>
        <p className="mt-2 text-sm text-ink-muted">
          That record does not exist, or you followed a link to something that has since
          been removed.
        </p>
        <Link
          href="/"
          className="mt-5 inline-grid h-10 place-items-center rounded-md bg-flame-500 px-4 text-sm font-semibold text-white hover:bg-flame-600"
        >
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
