import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { ButtonLink, DataTable, EmptyState, KpiCard, PageHeader, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { listSales, type SaleListRow } from "@/lib/sales/sales-db";

export const metadata: Metadata = { title: "Sales" };
export const dynamic = "force-dynamic";

const methodLabel: Record<string, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  bank: "Bank",
  card: "Card",
  credit: "Credit",
};

function saleDate(value: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi",
  }).format(new Date(value));
}

const columns: DataColumn<SaleListRow>[] = [
  { key: "receipt", header: "Receipt", priority: 1, cell: (sale) => <span className="code font-semibold text-ink">{sale.receiptNo}</span> },
  { key: "date", header: "Date", priority: 3, cell: (sale) => saleDate(sale.saleDate) },
  { key: "customer", header: "Customer", priority: 1, cell: (sale) => <span className="font-medium">{sale.customerName ?? "Walk-in"}</span> },
  { key: "type", header: "Type", priority: 2, cell: (sale) => <span className="capitalize">{sale.saleType}</span> },
  { key: "items", header: "Items", num: true, align: "right", priority: 3, cell: (sale) => sale.lineCount },
  { key: "payment", header: "Payment", priority: 2, cell: (sale) => sale.paymentMethods.length > 0 ? sale.paymentMethods.map((method) => methodLabel[method] ?? method).join(", ") : sale.balanceDue > 0 ? "Credit" : "—" },
  { key: "total", header: "Total", num: true, align: "right", priority: 1, cell: (sale) => <span className="font-semibold">{formatKsh(sale.total)}</span> },
  { key: "status", header: "Status", priority: 2, cell: (sale) => sale.status === "void" ? <StatusBadge tone="neutral">Void</StatusBadge> : sale.balanceDue > 0 ? <StatusBadge tone="warn">Credit due</StatusBadge> : <StatusBadge tone="ok">Paid</StatusBadge> },
];

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { products, notice, diagnostic } = await getCustomerContext();
  if (!products) {
    return <AppShell title="Sales" staff={currentStaff} branch={stationName} activeHref="/sales"><DatabaseUnavailable notice={notice} diagnostic={diagnostic} /></AppShell>;
  }
  const { q = "" } = await searchParams;
  const rows = await listSales(products.db, process.env.SALES_BRANCH_ID ?? "loc-jam", q);
  const posted = rows.filter((sale) => sale.status === "posted");
  const revenue = posted.reduce((sum, sale) => sum + sale.total, 0);
  const collected = posted.reduce((sum, sale) => sum + sale.amountPaid, 0);
  const credit = posted.reduce((sum, sale) => sum + sale.balanceDue, 0);

  return (
    <AppShell title="Sales" subtitle="Completed sales and receipts" staff={currentStaff} branch={stationName} activeHref="/sales">
      <PageHeader title="Sales" subtitle="Completed transactions at this branch" action={<ButtonLink href="/sales/new" variant="primary">New sale</ButtonLink>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Posted sales" value={formatKsh(revenue)} subtext={`${posted.length} completed receipt${posted.length === 1 ? "" : "s"}`} />
        <KpiCard label="Collected" value={formatKsh(collected)} subtext="Cash, M-Pesa, bank and card" />
        <KpiCard label="Credit due" value={formatKsh(credit)} subtext={credit > 0 ? "Customer balances outstanding" : "No outstanding credit"} />
      </div>
      <form className="flex gap-2 rounded-lg border border-border bg-surface p-3 shadow-card">
        <label className="sr-only" htmlFor="sale-search">Find a receipt, customer or rider</label>
        <input id="sale-search" name="q" defaultValue={q} className="min-h-[var(--touch-target)] min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-base text-ink" placeholder="Find receipt, customer or rider" />
        <ButtonLink href="/sales" variant="ghost">Clear</ButtonLink>
        <button type="submit" className="min-h-[var(--touch-target)] rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted">Search</button>
      </form>
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
        <DataTable columns={columns} rows={rows} rowKey={(sale) => sale.id} rowHref={(sale) => `/sales/${sale.id}`} caption="Sales register" empty={<EmptyState title="No sales found" description={q ? "Try a different receipt, customer or rider." : "Complete your first sale to create a receipt here."} action={<ButtonLink href="/sales/new" variant="primary">New sale</ButtonLink>} />} />
      </section>
    </AppShell>
  );
}
