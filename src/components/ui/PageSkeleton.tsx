import { Skeleton, SkeletonRows } from "./index";

/**
 * The shape a page takes while its data loads.
 *
 * It mirrors the real layout - header, toolbar, table - so nothing jumps when
 * the rows arrive. Used by each route's loading.tsx.
 */
export function PageSkeleton({
  title,
  rows = 6,
}: {
  title: string;
  rows?: number;
}) {
  return (
    <>
      <div className="flex min-h-[var(--header-page)] items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <section
        className="rounded-lg border border-border bg-surface shadow-card"
        role="status"
        aria-live="polite"
      >
        <header className="flex min-h-[var(--row-table)] items-center border-b border-border px-4">
          <span className="sr-only">Loading {title}</span>
          <Skeleton className="h-4 w-24" />
        </header>
        <SkeletonRows rows={rows} />
      </section>
    </>
  );
}
