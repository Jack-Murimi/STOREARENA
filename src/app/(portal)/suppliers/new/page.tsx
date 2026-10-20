import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Card, PageHeader } from "@/components/ui";
import { SupplierForm } from "./SupplierForm";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";

export const metadata: Metadata = { title: "New supplier" };
export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  const { notice, diagnostic, products } = await getCustomerContext();
  if (!products) {
    return (
      <AppShell title="New supplier" staff={currentStaff} branch={stationName} activeHref="/suppliers">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }
  return (
    <AppShell title="New supplier" staff={currentStaff} branch={stationName} activeHref="/suppliers">
      <PageHeader title="New supplier" subtitle="Who you buy from" />
      <Card>
        <SupplierForm />
      </Card>
    </AppShell>
  );
}
