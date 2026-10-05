import { BrandMark } from "./BrandMark";
import { BellIcon, MenuIcon, SearchIcon } from "./icons";
import type { StaffMember } from "@/lib/types";

interface TopbarProps {
  title: string;
  subtitle: string;
  staff: StaffMember;
}

export function Topbar({ title, subtitle, staff }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card/90 backdrop-blur">
      {/* Mobile-only brand strip: the sidebar is hidden below lg. */}
      <div className="flex items-center justify-between border-b border-line bg-navy-900 px-4 py-3 lg:hidden">
        <BrandMark />
        <button
          type="button"
          aria-label="Open navigation"
          className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-navy-800 hover:text-white"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="truncate text-[12.5px] text-ink-soft">{subtitle}</p>
        </div>

        <div className="order-3 w-full sm:order-none sm:w-auto sm:max-w-[260px] sm:flex-1">
          <label className="relative block">
            <span className="sr-only">Search transactions, customers or cylinders</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              placeholder="Search sales, customers…"
              className="w-full rounded-lg border border-line bg-canvas py-2 pr-3 pl-9 text-[13px] text-ink placeholder:text-ink-faint focus:border-flame-500 focus:bg-white focus:ring-2 focus:ring-flame-500/25 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Alerts"
            className="relative grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-ink-soft hover:text-ink"
          >
            <BellIcon className="h-[18px] w-[18px]" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-flame-500 ring-2 ring-white" />
          </button>
          <div className="hidden items-center gap-2.5 rounded-lg border border-line bg-white py-1.5 pr-3 pl-1.5 sm:flex">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-navy-900 text-[11px] font-semibold text-flame-300">
              {staff.initials}
            </span>
            <span className="leading-tight">
              <span className="block text-[12.5px] font-medium text-ink">
                {staff.name.split(" ")[0]}
              </span>
              <span className="block text-[11px] text-ink-faint">{staff.role}</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
