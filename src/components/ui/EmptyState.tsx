import type { ComponentType, ReactNode, SVGProps } from "react";

/**
 * What a panel shows when there is nothing in it yet. An empty table with a
 * header row reads as a bug; this says what is missing and what to do.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {Icon ? (
        <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-muted text-ink-subtle">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="text-md font-semibold text-ink">{title}</p>
      {description ? (
        <p className="max-w-md text-base text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
