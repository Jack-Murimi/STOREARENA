import { navItemIsActive, navItems } from "./nav";

/**
 * Under 768px the sidebar becomes a bottom tab bar. Three items, so it fits
 * the five-item maximum with room for whatever ships next.
 */
export function BottomTabBar({ activeHref = "/" }: { activeHref?: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = navItemIsActive(item, activeHref);
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[var(--touch-target)] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
              active ? "text-orange-700" : "text-ink-subtle"
            }`}
          >
            <Icon className="h-5 w-5" />
            {item.short}
          </a>
        );
      })}
    </nav>
  );
}
