import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { getPosData } from "@/lib/sales/pos-data";
import { SaleTerminal } from "./SaleTerminal";

export const metadata: Metadata = { title: "New sale" };
export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  const { products, notice, diagnostic } = await getCustomerContext();
  if (!products) {
    return (
      <AppShell title="New sale" staff={currentStaff} branch={stationName} activeHref="/sales">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const data = await getPosData(products.db, process.env.SALES_BRANCH_ID ?? "loc-jam");
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
      title="New sale"
      subtitle="Point of sale"
      staff={currentStaff}
      branch={data.branch.name}
      activeHref="/sales"
    >
      <SaleTerminal data={data} />
    </AppShell>
  );
}
