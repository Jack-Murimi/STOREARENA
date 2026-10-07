import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AllocateForm } from "./AllocateForm";
import { SupplierPicker } from "./SupplierPicker";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { listSuppliers, pendingInvoices, supplierById } from "@/lib/purchases/db";

export const metadata: Metadata = { title: "Record payment" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const label = "block text-[var(--text-xs)] font-medium text-[var(--text-secondary)] mb-1.5";

export default async function NewPaymentPage({ searchParams }: Props) {
  const params = await searchParams;
  const supplierId = typeof params.supplier === "string" ? params.supplier : "";

  const { products, notice, diagnostic } = await getCustomerContext();
  if (!products) {
    return (
      <AppShell title="Record payment" staff={currentStaff} branch={stationName} activeHref="/payments">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const db = products.db;
  const suppliers = await listSuppliers(db);
  const supplier = supplierId ? await supplierById(db, supplierId) : null;
  const invoices = supplier ? await pendingInvoices(db, supplier.id) : [];
  const outstanding = invoices.reduce((s, i) => s + i.due, 0);
  const branches = await products.listLocations();
  const branchId = branches.find((b) => b.active)?.id ?? "";

  return (
    <AppShell title="Record payment" staff={currentStaff} branch={stationName} activeHref="/payments">
      <PageHeader
        title="Record payment"
        subtitle="Allocate across one or more invoices, or keep the rest as credit"
      />

      <Card>
        <label htmlFor="supplier" className={label}>Supplier *</label>
        <SupplierPicker suppliers={suppliers} value={supplierId} />
        <p className="mt-1 text-[var(--text-xs)] text-[var(--text-tertiary)]">
          Pick the supplier to see what they are owed.
        </p>
      </Card>

      {!supplier ? null : invoices.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing outstanding"
            description={`${supplier.name} has no unpaid invoices. Record a payment anyway and it will be held as credit until the next invoice.`}
          />
        </Card>
      ) : (
        <Card>
          <AllocateForm
            supplierId={supplier.id}
            branchId={branchId}
            outstanding={outstanding}
            invoices={invoices.map((i) => ({
              id: i.id, invoiceNo: i.invoiceNo, invoiceDate: i.invoiceDate,
              total: i.total, due: i.due,
            }))}
          />
        </Card>
      )}
    </AppShell>
  );
}
