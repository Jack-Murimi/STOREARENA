import type { ReactNode } from "react";

/**
 * A compact metric: about 88px tall, no icon by default.
 *
 * The old version was a large tinted card with an icon chip. Three of these
 * now fit above the fold where four used to push the stock table off screen.
 *
 * A delta is only shown when it compares like-for-like; `deltaCaption` must
 * say what it is against, or leave both off.
 */
export function KpiCard({
  label,
  value,
  subtext,
  delta,
  deltaCaption,
  chip,
}: {
  label: string;
  value: string;
  /** One supporting line, e.g. "13 cylinders · 10 sales · avg KSh 3,680". */
  subtext?: string;
  delta?: string;
  deltaCaption?: string;
  /** A badge or link on the right, e.g. "2 need reorder". */
  chip?: ReactNode;
}) {
  return (
    <div className="flex min-h-[88px] flex-col justify-center gap-0.5 rounded-lg border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">
          {label}
        </span>
        {chip}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="num text-xl font-semibold text-ink">{value}</span>
        {delta ? <span className="num text-sm text-ink-muted">{delta}</span> : null}
      </div>
      {subtext ? <p className="truncate text-sm text-ink-muted">{subtext}</p> : null}
      {deltaCaption ? (
        <p className="truncate text-xs text-ink-subtle">{deltaCaption}</p>
      ) : null}
    </div>
  );
}
