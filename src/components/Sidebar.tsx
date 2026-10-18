import { BrandMark } from "./BrandMark";
import { navGroups, navItemIsActive } from "./nav";

export function Sidebar({ activeHref = "/" }: { activeHref?: string }) {
  return <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-rail)] shrink-0 flex-col border-r border-nav-hover bg-nav-bg md:flex xl:w-[var(--sidebar-width)]">
    <div className="flex h-[var(--header-page)] items-center justify-center border-b border-nav-hover px-2 xl:justify-start xl:px-4"><BrandMark className="xl:[&>span:nth-child(2)]:block [&>span:nth-child(2)]:hidden" /></div>
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-3">
      {navGroups.map((group, index) => <section key={group.label} className={index === 0 ? "" : "mt-5"}><h2 className="mb-1 hidden px-3 text-xs font-semibold tracking-wide text-nav-text/60 uppercase xl:block">{group.label}</h2><ul className="space-y-0.5">{group.items.map((item) => { const Icon = item.icon; const active = navItemIsActive(item, activeHref); return <li key={item.href}><a href={item.href} aria-current={active ? "page" : undefined} title={item.label} className={`relative flex min-h-[var(--touch-target)] items-center justify-center gap-3 rounded-md px-3 text-base font-medium transition-colors duration-150 xl:justify-start ${active ? "bg-nav-active-bg text-nav-active" : "text-nav-text hover:bg-nav-hover hover:text-white"}`}>{active ? <span aria-hidden="true" className="absolute top-1/2 left-0 h-5 w-[var(--nav-active-marker)] -translate-y-1/2 rounded-r-sm bg-orange-500" /> : null}<Icon className="h-5 w-5 shrink-0" /><span className="hidden truncate xl:inline">{item.label}</span></a></li>; })}</ul></section>)}
    </nav>
  </aside>;
}
