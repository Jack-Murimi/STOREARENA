/**
 * Loading placeholders that match the shape of what they replace, so a panel
 * does not jump when the data lands.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Three or four table-shaped rows, for any data block while it loads. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="space-y-2 p-4"
      role="status"
      aria-label="Loading"
      aria-busy="true"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
