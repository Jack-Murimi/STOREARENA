import { AppShell } from "@/components/AppShell";
import { PageSkeleton } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";

export default function Loading() {
  return (
    <AppShell
      title="Customers"
      subtitle="Loading…"
      staff={currentStaff}
      branch={stationName}
      activeHref="/customers"
    >
      <PageSkeleton title="Customers" />
    </AppShell>
  );
}
