import type { ReactNode } from "react";
import { BottomTabBar } from "./BottomTabBar";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { StaffMember } from "@/lib/types";

/**
 * The frame every screen sits in.
 *
 * It existed as six lines copy-pasted into each page, which is how the pages
 * ended up with four different paddings and two different header heights.
 */
export function AppShell({
  title,
  subtitle,
  staff,
  branch,
  activeHref,
  topbarAction,
  children,
}: {
  title: string;
  subtitle?: string;
  staff: StaffMember;
  branch?: string;
  activeHref?: string;
  topbarAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar activeHref={activeHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} subtitle={subtitle} staff={staff} branch={branch} action={topbarAction} />
        <main className="page-shell flex-1 space-y-4 pb-20 md:pb-0">{children}</main>
      </div>
      <BottomTabBar activeHref={activeHref} />
    </div>
  );
}
