import { BrandMark } from "./BrandMark";
import { navItemIsActive, navItems } from "./nav";

/**
 * 232px, warm charcoal, collapses to a 64px icon rail.
 *
 * The user and the branch are NOT here — they live in the top bar, once each.
 * A "Signed in" block at the bottom of the sidebar duplicated the top bar's
 * avatar and gave the branch two homes.
 */
export function Sidebar({ activeHref = "/" }: { activeHref?: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-rail)] shrink-0 flex-col border-r border-nav-hover bg-nav-bg md:flex xl:w-[var(--sidebar-width)]">
      <div className="flex h-[var(--header-page)] items-center justify-center border-b border-nav-hover px-2 xl:justify-start xl:px-4">
        <BrandMark className="xl:[&>span:nth-child(2)]:block [&>span:nth-child(2)]:hidden" />
      </div>

      <nav aria-label="Primary" className="flex-1 px-2 py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = navItemIsActive(item, activeHref);
            return (
              <li key={item.href}>
                {/*
                  A plain anchor rather than next/link: an internal portal gains
                  nothing from client-side routing, and a real page load works
                  everywhere — including inside a sandboxed preview frame where
                  the router's fetch can be blocked.
                */}
                <a
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={`relative flex min-h-[var(--touch-target)] items-center justify-center gap-3 rounded-md px-3 text-base font-medium transition-colors duration-150 xl:justify-start ${
                    active
                      ? "bg-nav-active-bg text-nav-active"
                      : "text-nav-text hover:bg-nav-hover hover:text-white"
                  }`}
                >
                  {/* Active marker: a 3px orange bar on the left. No dot. */}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 left-0 h-5 w-[var(--nav-active-marker)] -translate-y-1/2 rounded-r-sm bg-orange-500"
                    />
                  ) : null}
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="hidden truncate xl:inline">{item.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
