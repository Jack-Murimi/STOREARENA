import { FlameIcon } from "./icons";

interface BrandMarkProps {
  /** Text colour for the wordmark. */
  tone?: "light" | "dark";
  className?: string;
  /** Where the lockup goes. Defaults to the dashboard. */
  href?: string;
}

/**
 * Gateway Gas Enterprises lockup: flame tile + wordmark.
 *
 * It is a link home. A brand mark in the corner that does nothing reads as a
 * broken control, and "click the logo to go home" is the one shortcut nobody
 * has to be taught.
 */
export function BrandMark({ tone = "light", className, href = "/" }: BrandMarkProps) {
  const isLight = tone === "light";
  return (
    <a
      href={href}
      className={`flex min-h-[var(--touch-target)] items-center gap-3 rounded-md transition-opacity duration-150 hover:opacity-85 ${className ?? ""}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-flame-400 to-flame-600 text-navy-950 shadow-card">
        <FlameIcon className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span
          className={`block text-base font-semibold tracking-tight ${
            isLight ? "text-white" : "text-ink"
          }`}
        >
          Gateway Gas
        </span>
        <span
          className={`block text-xs font-medium uppercase tracking-widest ${
            isLight ? "text-nav-text" : "text-ink-subtle"
          }`}
        >
          Enterprises
        </span>
      </span>
      <span className="sr-only">Go to the dashboard</span>
    </a>
  );
}
