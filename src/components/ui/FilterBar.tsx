import type { ReactNode } from "react";

/**
 * One toolbar row per screen: search on the left, filters in the middle, the
 * primary action at the right.
 *
 * Pages must not carry a second search field — there is already a global one
 * in the top bar, and two boxes that look the same invite typing in the wrong
 * one.
 */
export function FilterBar({
  search,
  filters,
  action,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search ? <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto sm:max-w-xs">{search}</div> : null}
      {filters ? <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div> : null}
      {action ? <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">{action}</div> : null}
    </div>
  );
}
