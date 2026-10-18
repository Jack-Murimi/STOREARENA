import { mobileMoreGroups, mobileNavItems, navItemIsActive } from "./nav";

/** Four high-frequency tabs plus a semantic More drawer keeps every page
 * reachable on a phone without squeezing eleven labels into one row. */
export function BottomTabBar({ activeHref = "/" }: { activeHref?: string }) {
  const moreActive = mobileMoreGroups.some((group) => group.items.some((item) => navItemIsActive(item, activeHref)));
  return <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden">
    {mobileNavItems.map((item) => { const Icon=item.icon; const active=navItemIsActive(item,activeHref); return <a key={item.href} href={item.href} aria-current={active?"page":undefined} className={`flex min-h-[var(--touch-target)] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium ${active?"text-orange-700":"text-ink-subtle"}`}><Icon className="h-5 w-5" />{item.short}</a>; })}
    <details className="relative flex flex-1"><summary className={`flex min-h-[var(--touch-target)] w-full list-none flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium ${moreActive?"text-orange-700":"text-ink-subtle"}`}><span className="text-xl leading-none">•••</span>More</summary><div className="absolute right-1 bottom-[calc(100%+8px)] w-60 rounded-lg border border-border bg-surface p-2 shadow-raised">{mobileMoreGroups.map((group)=><section key={group.label} className="py-1"><h2 className="px-2 py-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">{group.label}</h2>{group.items.map((item)=>{const Icon=item.icon;const active=navItemIsActive(item,activeHref);return <a key={item.href} href={item.href} className={`flex min-h-[var(--touch-target)] items-center gap-3 rounded px-2 text-sm font-medium ${active?"bg-surface-muted text-orange-700":"text-ink"}`}><Icon className="h-5 w-5" />{item.label}</a>})}</section>)}</div></details>
  </nav>;
}
