import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentStaffAccess } from "@/lib/auth";

export default async function RiderLayout({ children }: { children: ReactNode }) {
  const staff = await currentStaffAccess();
  if (!staff) redirect("/login?next=/rider");
  if (staff.role !== "rider") redirect("/");
  return children;
}
