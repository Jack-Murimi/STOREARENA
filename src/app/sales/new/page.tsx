import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { getPosData } from "@/lib/sales/pos-data";
import { SaleTerminal } from "./SaleTerminal";

export const metadata: Metadata = { title: "New sale" };
export const dynamic = "force-dynamic";

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { products, notice, diagnostic } = await getCustomerContext();
  if (!products) {
    return (
      <AppShell title="New sale" staff={currentStaff} branch={stationName} activeHref="/sales">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const requestedBranch = (await searchParams).branch;
  const data = await getPosData(products.db, requestedBranch || process.env.SALES_BRANCH_ID || "loc-jam");
  if (!data) {
    return (
      <AppShell title="New sale" staff={currentStaff} branch={stationName} activeHref="/sales">
        <DatabaseUnavailable
          notice="The sales branch could not be found or is inactive."
          diagnostic="Set SALES_BRANCH_ID to an active branch location id."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Sales › New sale"
      topbarAction={<ol aria-label="Sale workflow" className="hidden items-center gap-1 rounded-pill border border-border bg-surface px-2 py-1 text-xs font-semibold sm:flex"><li className="text-orange-700">1 Sale</li><li aria-hidden="true" className="text-ink-subtle">—</li><li className="text-ink-subtle">2 Payment</li></ol>}
      staff={currentStaff}
      branch={data.branch.name}
      activeHref="/sales"
    >
      <SaleTerminal key={data.branch.id} data={data} canChangeBranch={["Admin", "Director"].includes(currentStaff.role)} />
    </AppShell>
  );
}
