import type { ReactNode } from "react";

/**
 * A titled surface. 16px padding, one hairline, one shadow — the same card
 * everywhere instead of five slightly different ones.
 *
 * `flush` drops the body padding for tables that should reach the edge.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  flush = false,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-surface shadow-card ${className}`}
    >
      {title || action ? (
        <header className="flex min-h-[var(--row-table)] items-center gap-3 border-b border-border px-4">
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="truncate text-xs text-ink-subtle">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}
