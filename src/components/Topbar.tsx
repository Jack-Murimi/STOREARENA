import { UserMenu } from "./UserMenu";
import { SearchIcon } from "./icons";
import type { StaffMember } from "@/lib/types";

/**
 * The top bar: one search, the branch, and the signed-in person. Nothing else.
 *
 * The notification bell is gone — there is no notification system behind it,
 * and a badge that is always lit trains people to ignore badges.
 *
 * The branch is shown here and nowhere else. It is not yet a switcher: making
 * it one means the data layer has to accept a branch parameter, which is a
 * behaviour change rather than a visual one.
 */
export function Topbar({
  title,
  subtitle,
  staff,
  branch,
  /** Transitional: older pages pass this; the nav highlight lives in the sidebar. */
  activeHref,
}: {
  title: string;
  subtitle?: string;
  staff: StaffMember;
  branch?: string;
  activeHref?: string;
}) {
  void activeHref;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="flex min-h-[var(--header-page)] items-center gap-3 px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-md font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle ? (
            <p className="hidden truncate text-xs text-ink-subtle sm:block">{subtitle}</p>
          ) : null}
        </div>

        {/* The only search box in the app. It searches customers, because that
            is the only search that exists; the placeholder says so rather than
            promising a global search it cannot deliver. */}
        <form
          action="/customers"
          method="get"
          role="search"
          className="hidden min-w-0 flex-1 sm:block sm:max-w-xs"
        >
          <label className="relative block">
            <span className="sr-only">Search customers by name, code or phone</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              name="q"
              placeholder="Search customers…"
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-ink-subtle focus:border-orange-500 focus:outline-none"
            />
          </label>
        </form>

        <div className="flex shrink-0 items-center gap-1">
          {branch ? (
            <span className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm text-ink-muted lg:flex">
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 text-ink-subtle"
                aria-hidden="true"
              >
                <path d="M8 14s4.5-4 4.5-7.2A4.5 4.5 0 0 0 3.5 6.8C3.5 10 8 14 8 14Z" />
                <circle cx="8" cy="6.6" r="1.6" />
              </svg>
              {branch}
            </span>
          ) : null}
          <UserMenu name={staff.name} role={staff.role} initials={staff.initials} />
        </div>
      </div>
    </header>
  );
}
