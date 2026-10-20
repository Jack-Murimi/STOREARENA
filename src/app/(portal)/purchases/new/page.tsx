import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Card, PageHeader } from "@/components/ui";
import { InvoiceForm, type Option } from "./InvoiceForm";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";

export const metadata: Metadata = { title: "New invoice" };
export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const { products, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return (
      <AppShell
        title="New invoice"
        staff={currentStaff}
        branch={stationName}
        activeHref="/purchases"
      >
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const db = products.db;
  const [suppliers, branches, variants] = await Promise.all([
    db.query<Record<string, unknown>>(
      `select id, name, payment_terms_days from suppliers where is_active order by name`,
      [],
    ),
    products.listLocations(),
    db.query<Record<string, unknown>>(
      `select v.id, v.name, c.id as category_id, c.name as category_name
         from product_variants v join categories c on c.id = v.category_id
        order by c.name, v.name`,
      [],
    ),
  ]);

  const activeBranches = branches.filter((b) => b.active);

  return (
    <AppShell
      title="New invoice"
      subtitle="Record what a supplier delivered"
      staff={currentStaff}
      branch={stationName}
      activeHref="/purchases"
    >
      <PageHeader title="New purchase invoice" subtitle="Totals are computed on the server, not here" />

      <Card>
        <InvoiceForm
          suppliers={suppliers.map((s) => ({
            id: String(s.id),
            name: String(s.name),
            paymentTermsDays: Number(s.payment_terms_days ?? 0),
          }))}
          branches={activeBranches.map((b) => ({ id: b.id, name: b.name }))}
          products={variants.map<Option>((v) => ({
            id: String(v.id),
            name: String(v.name),
            categoryId: String(v.category_id),
            categoryName: String(v.category_name),
          }))}
          defaultBranchId={activeBranches[0]?.id ?? ""}
          branchLocked={false}
        />
      </Card>
    </AppShell>
  );
}
