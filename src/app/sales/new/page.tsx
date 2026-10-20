import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { currentStaff, stationName } from "@/lib/data";
import { currentStaffAccess } from "@/lib/auth";
import { getCustomerContext } from "@/lib/db";
import { getPosData } from "@/lib/sales/pos-data";
import { SaleTerminal } from "./SaleTerminal";

export const metadata: Metadata = { title: "New sale" };
export const dynamic = "force-dynamic";

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const [context, staffAccess, params] = await Promise.all([
    getCustomerContext(),
    currentStaffAccess(),
    searchParams,
  ]);
  const { products, notice, diagnostic } = context;
  if (!products) {
    return (
      <AppShell title="New sale" staff={currentStaff} branch={stationName} activeHref="/sales">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const requestedBranch = params.branch;
  const userDefaultBranch = staffAccess?.branchIds[0];
  const targetBranch = requestedBranch || userDefaultBranch || process.env.SALES_BRANCH_ID || "loc-jam";
  const data = await getPosData(products.db, targetBranch);
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

  const canChangeBranch = staffAccess !== null && (staffAccess.role === "admin" || staffAccess.role === "director");

  return (
    <AppShell
      title="Sales › New sale"
      topbarAction={<ol aria-label="Sale workflow" className="hidden items-center gap-1 rounded-pill border border-border bg-surface px-2 py-1 text-xs font-semibold sm:flex"><li className="text-orange-700">1 Sale</li><li aria-hidden="true" className="text-ink-subtle">—</li><li className="text-ink-subtle">2 Payment</li></ol>}
      staff={currentStaff}
      branch={data.branch.name}
      activeHref="/sales"
    >
      <SaleTerminal key={data.branch.id} data={data} canChangeBranch={canChangeBranch} />
    </AppShell>
  );
}
