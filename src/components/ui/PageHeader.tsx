import type { ReactNode } from "react";

/**
 * One header per screen: title, an optional single-line subtitle, and the one
 * primary action at the right. About 56px tall.
 *
 * Anything else a page wants to offer (manage branch, export) goes in `menu`,
 * not in a second row of buttons.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  menu,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <header className="flex min-h-[var(--header-page)] flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? (
          <p className="truncate text-sm text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
        {menu}
        {action}
      </div>
    </header>
  );
}
