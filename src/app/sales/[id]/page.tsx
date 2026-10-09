import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { ButtonLink, DataTable, PageHeader, StatusBadge } from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { getSaleDetail, type SaleDetailLine } from "@/lib/sales/sales-db";
import { VoidSaleForm } from "./VoidSaleForm";

export const metadata: Metadata = { title: "Sale receipt" };
export const dynamic = "force-dynamic";

const typeLabel: Record<string, string> = {
  refill: "Refill", new_cylinder: "Complete gas", accessory: "Accessory", water: "Water", other: "Other",
};
const paymentLabel: Record<string, string> = { cash: "Cash", mpesa: "M-Pesa", bank: "Bank", card: "Card", credit: "Credit" };

const lineColumns: DataColumn<SaleDetailLine>[] = [
  { key: "product", header: "Product", priority: 1, cell: (line) => <><span className="font-medium">{line.name}</span><span className="block text-xs text-ink-subtle">{line.brandName} · {typeLabel[line.lineType] ?? line.lineType}</span></> },
  { key: "qty", header: "Qty", num: true, align: "right", priority: 2, cell: (line) => line.quantity },
  { key: "price", header: "Unit price", num: true, align: "right", priority: 3, cell: (line) => formatKsh(line.unitPrice) },
  { key: "discount", header: "Discount", num: true, align: "right", priority: 3, cell: (line) => line.discountAmount > 0 ? formatKsh(line.discountAmount) : "—" },
  { key: "empties", header: "Empties", priority: 2, cell: (line) => line.emptiesReturned > 0 ? `${line.emptiesReturned} · ${line.emptyBrandName ?? "brand not recorded"}` : "—" },
  { key: "total", header: "Net", num: true, align: "right", priority: 1, cell: (line) => <span className="font-semibold">{formatKsh(line.lineTotal)}</span> },
];

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(value));
}

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { products, notice, diagnostic } = await getCustomerContext();
  if (!products) {
    return <AppShell title="Sale receipt" staff={currentStaff} branch={stationName} activeHref="/sales"><DatabaseUnavailable notice={notice} diagnostic={diagnostic} /></AppShell>;
  }
  const { id } = await params;
  const sale = await getSaleDetail(products.db, id);
  if (!sale) notFound();

  return (
    <AppShell title={`Receipt ${sale.receiptNo}`} subtitle="Sale detail" staff={currentStaff} branch={sale.branchName} activeHref="/sales">
      <PageHeader title={`Receipt ${sale.receiptNo}`} subtitle={dateTime(sale.saleDate)} action={<ButtonLink href="/sales/new" variant="primary">New sale</ButtonLink>} menu={<ButtonLink href="/sales" variant="ghost">Back to sales</ButtonLink>} />
      {sale.status === "void" ? <div className="rounded-lg border border-critical bg-critical-bg px-4 py-3"><StatusBadge tone="critical">Void</StatusBadge><p className="mt-2 text-sm text-ink">{sale.voidReason}</p></div> : null}
      <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-card md:grid-cols-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Customer</p><p className="mt-1 text-base font-semibold text-ink">{sale.customerName ?? "Walk-in"}</p>{sale.customerLocation ? <p className="text-sm text-ink-muted">{sale.customerLocation}</p> : null}</div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Fulfilment</p><p className="mt-1 text-base font-semibold capitalize text-ink">{sale.saleType}</p>{sale.riderName ? <p className="text-sm text-ink-muted">Rider: {sale.riderName}</p> : null}</div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Recorded by</p><p className="mt-1 text-base font-semibold text-ink">{sale.attendantName ?? "Staff"}</p>{sale.notes ? <p className="text-sm text-ink-muted">{sale.notes}</p> : null}</div>
      </section>
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-card"><DataTable columns={lineColumns} rows={sale.lines} rowKey={(line) => line.id} caption="Sale lines" /></section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card"><h2 className="text-base font-semibold text-ink">Payment</h2><div className="divide-line mt-3">{sale.payments.length > 0 ? sale.payments.map((payment) => <div key={payment.id} className="flex justify-between gap-3 py-2 text-sm"><span>{paymentLabel[payment.method] ?? payment.method}{payment.reference ? <span className="block text-xs text-ink-subtle">{payment.reference}</span> : null}</span><span className="num font-medium">{formatKsh(payment.amount)}</span></div>) : <p className="py-2 text-sm text-ink-muted">No payment recorded — the balance is customer credit.</p>}</div></div>
        <dl className="num rounded-lg border border-border bg-surface p-4 shadow-card"><div className="flex justify-between gap-4 text-sm"><dt className="text-ink-muted">Total</dt><dd className="font-semibold">{formatKsh(sale.total)}</dd></div><div className="mt-2 flex justify-between gap-4 text-sm"><dt className="text-ink-muted">Paid</dt><dd>{formatKsh(sale.amountPaid)}</dd></div><div className="mt-2 flex justify-between gap-4 text-base font-semibold"><dt>Credit due</dt><dd className={sale.balanceDue > 0 ? "text-warn" : "text-ink"}>{formatKsh(sale.balanceDue)}</dd></div>{sale.creditDueDate ? <div className="mt-2 flex justify-between gap-4 text-sm text-ink-muted"><dt>Due date</dt><dd>{sale.creditDueDate}</dd></div> : null}</dl>
      </section>
      {sale.status === "posted" ? <VoidSaleForm saleId={sale.id} /> : null}
    </AppShell>
  );
}
