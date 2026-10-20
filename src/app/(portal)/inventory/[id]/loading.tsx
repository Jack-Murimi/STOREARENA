import { AppShell } from "@/components/AppShell";
import { PageSkeleton } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";

export default function Loading() {
  return (
    <AppShell
      title="Loading…"
      staff={currentStaff}
      branch={stationName}
      activeHref="/inventory"
    >
      <PageSkeleton title="Inventory record" rows={4} />
    </AppShell>
  );
}
