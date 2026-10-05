"use client";

import { useState } from "react";
import { MenuIcon } from "./icons";
import { navGroups } from "./nav";

/**
 * The navigation drawer for narrow screens.
 *
 * The sidebar is hidden below `lg`, and the button that used to stand in for it
 * had no handler at all — so on a phone, or in a narrow preview pane, there was
 * no way to reach Customers. This is that drawer.
 */
export function MobileNav({ activeHref = "/" }: { activeHref?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-navy-800 hover:text-white"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {open ? (
        <div className="absolute top-11 right-0 z-50 w-64 rounded-xl border border-navy-700 bg-navy-900 p-3 shadow-xl">
          <nav className="space-y-4">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.href === activeHref;

                    if (item.soon) {
                      return (
                        <li key={item.label}>
                          <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2 py-2 text-[13.5px] text-white/35">
                            <Icon className="h-[18px] w-[18px]" />
                            <span className="flex-1">{item.label}</span>
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide">
                              Soon
                            </span>
                          </span>
                        </li>
                      );
                    }

                    return (
                      <li key={item.label}>
                        <a
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-2 py-2 text-[13.5px] font-medium transition ${
                            isActive
                              ? "bg-navy-700/70 text-white"
                              : "text-white/70 hover:bg-navy-800 hover:text-white"
                          }`}
                        >
                          <Icon
                            className={`h-[18px] w-[18px] ${
                              isActive ? "text-flame-400" : ""
                            }`}
                          />
                          {item.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
