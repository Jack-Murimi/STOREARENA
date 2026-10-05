import { BrandMark } from "./BrandMark";
import { SoonBadge } from "./icons";
import { navGroups } from "./nav";
import type { StaffMember } from "@/lib/types";

interface SidebarProps {
  staff: StaffMember;
  station: string;
  /** The route being rendered, so the matching nav item lights up. */
  activeHref?: string;
}

export function Sidebar({ staff, station, activeHref = "/" }: SidebarProps) {
  return (
    <aside className="hidden w-[264px] shrink-0 flex-col border-r border-navy-800/60 bg-navy-900 lg:flex">
      <div className="px-5 py-5">
        <BrandMark />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;

                if (item.soon) {
                  return (
                    <li key={item.label}>
                      <span
                        title="This screen is scheduled for the next build"
                        className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] text-white/35 transition"
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        <span className="flex-1">{item.label}</span>
                        <SoonBadge />
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    {/*
                      A plain anchor rather than next/link: an internal portal
                      gains nothing from client-side routing, and a real page
                      load works everywhere — including inside a sandboxed
                      preview frame where the router's fetch can be blocked.
                    */}
                    <a
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition ${
                        isActive
                          ? "bg-navy-700/70 text-white shadow-inner ring-1 ring-white/10"
                          : "text-white/70 hover:bg-navy-800 hover:text-white"
                      }`}
                    >
                      <Icon
                        className={`h-[18px] w-[18px] ${
                          isActive ? "text-flame-400" : ""
                        }`}
                      />
                      <span className="flex-1">{item.label}</span>
                      {isActive ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-flame-400" />
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-navy-800/60 p-4">
        <p className="px-1 pb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Signed in
        </p>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-flame-500/15 text-[12px] font-semibold text-flame-300 ring-1 ring-flame-400/30">
            {staff.initials}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-medium text-white">
              {staff.name}
            </span>
            <span className="block truncate text-[11.5px] text-white/45">
              {staff.role}
            </span>
          </span>
        </div>
        <p className="mt-3 truncate px-1 text-[11px] text-white/35" title={station}>
          {station}
        </p>
      </div>
    </aside>
  );
}
