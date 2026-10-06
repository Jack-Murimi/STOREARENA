/**
 * A small set of mutually exclusive filters, rendered as links.
 *
 * Links rather than buttons: the app filters through the URL, so a filter
 * survives a refresh, can be bookmarked, and needs no client JavaScript.
 */
export function SegmentedControl({
  label,
  options,
  activeValue,
  basePath,
  paramName,
  /** Other query params to carry across, e.g. the current branch. */
  keep,
}: {
  label: string;
  options: { value: string; label: string }[];
  activeValue: string;
  basePath: string;
  paramName: string;
  keep?: Record<string, string>;
}) {
  const hrefFor = (value: string) => {
    const query = new URLSearchParams(keep ?? {});
    if (value) query.set(paramName, value);
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-muted p-0.5"
    >
      {options.map((option) => {
        const active = option.value === activeValue;
        return (
          <a
            key={option.value || "all"}
            href={hrefFor(option.value)}
            aria-current={active ? "true" : undefined}
            className={`inline-flex h-8 items-center rounded-sm px-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
              active
                ? "bg-surface text-ink shadow-card"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {option.label}
          </a>
        );
      })}
    </div>
  );
}
