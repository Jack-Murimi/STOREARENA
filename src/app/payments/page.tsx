import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { DataTable, EmptyState, KpiCard, PageHeader, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { listAllPayments, type PaymentRow } from "@/lib/purchases/db";

export const metadata: Metadata = { title: "Supplier payments" };
export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", mpesa: "M-Pesa", bank: "Bank transfer", cheque: "Cheque",
};

const columns: DataColumn<PaymentRow>[] = [
  { key: "date", header: "Paid on", priority: 1, cell: (r) => r.paidOn },
  {
    key: "supplier", header: "Supplier", priority: 1,
    cell: (r) => (
      <Link href={`/suppliers/${r.supplierId}`} className="relative z-20 font-medium text-[var(--text-primary)] hover:underline">
        {r.supplierName}
      </Link>
    ),
  },
  { key: "method", header: "Method", priority: 2, cell: (r) => METHOD_LABEL[r.method] ?? r.method },
  { key: "ref", header: "Reference", priority: 3, cell: (r) => <span className="text-[var(--text-secondary)]">{r.reference ?? "—"}</span> },
  {
    key: "amount", header: "Paid", align: "right", num: true, priority: 1,
    cell: (r) => <span className="font-medium">{formatKsh(r.amount)}</span>,
  },
  {
    key: "allocated", header: "Allocated", align: "right", num: true, priority: 1,
    cell: (r) => (
      <span className="text-[var(--text-secondary)]">
        {formatKsh(r.allocated)}
        <span className="ml-1 text-[var(--text-xs)] text-[var(--text-tertiary)]">
          ({r.invoiceCount} inv)
        </span>
      </span>
    ),
  },
  {
    key: "credit", header: "Held as credit", align: "right", num: true, priority: 1,
    cell: (r) =>
      r.unallocated > 0 ? (
        <span className="font-medium text-[var(--info)]">{formatKsh(r.unallocated)}</span>
      ) : (
        <span className="text-[var(--text-tertiary)]">—</span>
      ),
  },
  {
    key: "status", header: "Status", priority: 2,
    cell: (r) => <StatusBadge tone={r.status === "void" ? "neutral" : "ok"}>{r.status === "void" ? "Void" : "Posted"}</StatusBadge>,
  },
];

export default async function PaymentsPage() {
  const { products, notice, diagnostic } = await getCustomerContext();
  if (!products) {
    return (
      <AppShell title="Payments" staff={currentStaff} branch={stationName} activeHref="/payments">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }
  const rows = await listAllPayments(products.db);
  const live = rows.filter((r) => r.status !== "void");
  const total = live.reduce((s, r) => s + r.amount, 0);
  const credit = live.reduce((s, r) => s + r.unallocated, 0);

  return (
    <AppShell title="Payments" subtitle="Money paid to suppliers" staff={currentStaff} branch={stationName} activeHref="/payments">
      <PageHeader
        title="Supplier payments"
        subtitle="One payment can cover several invoices; the rest is kept as credit"
        action={
          <Link href="/payments/new" className="inline-flex h-[var(--touch-target)] items-center rounded-lg bg-[var(--orange-500)] px-4 text-[var(--text-sm)] font-semibold text-[var(--text-on-orange)] hover:bg-[var(--orange-600)]">
            Record payment
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Total paid" value={formatKsh(total)} subtext={`${live.length} payment${live.length === 1 ? "" : "s"}`} />
        <KpiCard label="Held as credit" value={formatKsh(credit)} subtext={credit > 0 ? "Unallocated, ready to use" : "Nothing unallocated"} />
        <KpiCard label="Allocated" value={formatKsh(total - credit)} subtext="Applied to invoices" />
      </div>
      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id} caption="Supplier payments"
        empty={<EmptyState title="No payments yet" description="Record a payment and allocate it across one or more invoices." />}
      />
    </AppShell>
  );
}
