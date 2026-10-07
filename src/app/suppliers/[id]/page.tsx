import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import {
  Card, DataTable, EmptyState, KpiCard, PageHeader, Tabs,
} from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import {
  listPurchases, supplierById, supplierStatement,
  type PurchaseRow, type StatementLine,
} from "@/lib/purchases/db";

export const metadata: Metadata = { title: "Supplier" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const invoiceColumns: DataColumn<PurchaseRow>[] = [
  { key: "date", header: "Date", priority: 1, cell: (r) => r.invoiceDate },
  {
    key: "no", header: "Invoice", priority: 1,
    cell: (r) => <span className="font-medium text-[var(--text-primary)]">{r.invoiceNo}</span>,
  },
  { key: "branch", header: "Branch", priority: 3, cell: (r) => r.branchName },
  {
    key: "total", header: "Total", align: "right", num: true, priority: 1,
    cell: (r) => <span className="font-medium">{formatKsh(r.total)}</span>,
  },
  {
    key: "paid", header: "Paid", align: "right", num: true, priority: 2,
    cell: (r) => <span className="text-[var(--text-secondary)]">{formatKsh(r.paid)}</span>,
  },
  {
    key: "due", header: "Outstanding", align: "right", num: true, priority: 2,
    cell: (r) => (
      <span className={r.due > 0 ? "font-medium text-[var(--warn)]" : "text-[var(--text-tertiary)]"}>
        {formatKsh(r.due)}
      </span>
    ),
  },
  { key: "status", header: "Status", priority: 2, cell: (r) => r.paymentStatus },
];

const statementColumns: DataColumn<StatementLine>[] = [
  { key: "date", header: "Date", priority: 1, cell: (r) => r.date },
  {
    key: "ref", header: "Reference", priority: 1,
    cell: (r) => (
      <span className="text-[var(--text-secondary)]">
        {r.reference}
        <span className="ml-2 text-[var(--text-xs)] text-[var(--text-tertiary)]">
          {r.kind === "payment" ? "payment" : "invoice"}
        </span>
      </span>
    ),
  },
  {
    key: "debit", header: "Invoiced", align: "right", num: true, priority: 1,
    cell: (r) => (r.debit > 0 ? formatKsh(r.debit) : <span className="text-[var(--text-tertiary)]">—</span>),
  },
  {
    key: "credit", header: "Paid", align: "right", num: true, priority: 1,
    cell: (r) => (r.credit > 0 ? formatKsh(r.credit) : <span className="text-[var(--text-tertiary)]">—</span>),
  },
  {
    key: "running", header: "Balance", align: "right", num: true, priority: 1,
    cell: (r) => (
      <span className={r.running > 0 ? "font-medium text-[var(--warn)]" : "text-[var(--text-secondary)]"}>
        {formatKsh(r.running)}
      </span>
    ),
  },
];

const AGEING_LABELS = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1–30d" },
  { key: "d31_60", label: "31–60d" },
  { key: "d61_90", label: "61–90d" },
  { key: "d90Plus", label: "90d+" },
] as const;

export default async function SupplierPage({ params }: Props) {
  const { id } = await params;
  const { products, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return (
      <AppShell title="Supplier" staff={currentStaff} branch={stationName} activeHref="/suppliers">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const db = products.db;
  const supplier = await supplierById(db, id);
  if (!supplier) notFound();

  const [invoices, statement] = await Promise.all([
    listPurchases(db, { supplierId: id }),
    supplierStatement(db, id),
  ]);

  const ageingRows = AGEING_LABELS.map((a) => ({ ...a, value: supplier.ageing[a.key] }));
  const paidCount = invoices.filter((i) => i.paymentStatus === "paid").length;

  return (
    <AppShell
      title={supplier.name}
      subtitle="Supplier account"
      staff={currentStaff}
      branch={stationName}
      activeHref="/suppliers"
    >
      <PageHeader
        title={supplier.name}
        subtitle={
          [
            supplier.isActive ? "Active" : "Inactive",
            `${supplier.paymentTermsDays}-day terms`,
            supplier.phone ?? null,
            supplier.email ?? null,
          ].filter(Boolean).join(" · ")
        }
        action={
          <Link
            href="/purchases/new"
            className="inline-flex h-[var(--touch-target)] items-center gap-2 rounded-lg bg-[var(--orange-500)] px-4 text-[var(--text-sm)] font-semibold text-[var(--text-on-orange)] hover:bg-[var(--orange-600)]"
          >
            New invoice
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="We owe"
          value={formatKsh(supplier.balance)}
          subtext={supplier.balance > 0 ? "Outstanding" : "Account settled"}
        />
        <KpiCard
          label="Overdue"
          value={formatKsh(supplier.overdueAmount)}
          subtext={supplier.overdueAmount > 0 ? "Past due date" : "Nothing overdue"}
        />
        <KpiCard
          label="Total billed"
          value={formatKsh(supplier.totalBilled)}
          subtext={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Total paid"
          value={formatKsh(supplier.totalPaid)}
          subtext={`${paidCount} settled`}
        />
      </div>

      <Card title="Ageing" subtitle="What we owe, by how late it is">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {ageingRows.map((a) => (
            <div key={a.key} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
              <dt className="text-[var(--text-xs)] text-[var(--text-tertiary)]">{a.label}</dt>
              <dd
                className={
                  a.value > 0 && (a.key === "d61_90" || a.key === "d90Plus")
                    ? "mt-0.5 text-[var(--text-base)] font-semibold text-[var(--critical)]"
                    : a.value > 0
                      ? "mt-0.5 text-[var(--text-base)] font-semibold text-[var(--warn)]"
                      : "mt-0.5 text-[var(--text-base)] font-semibold text-[var(--text-tertiary)]"
                }
              >
                {formatKsh(a.value)}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Tabs
        label="Supplier account"
        tabs={[
          {
            id: "invoices",
            label: `Invoices (${invoices.length})`,
            content: (
              <DataTable
                columns={invoiceColumns}
                rows={invoices}
                rowKey={(r) => r.id}
                rowHref={(r) => `/purchases/${r.id}`}
                caption={`Invoices from ${supplier.name}`}
                empty={
                  <EmptyState
                    title="No invoices yet"
                    description="Purchase invoices raised against this supplier will appear here."
                  />
                }
              />
            ),
          },
          {
            id: "statement",
            label: `Statement (${statement.length})`,
            content: (
              <DataTable
                columns={statementColumns}
                rows={statement}
                rowKey={(r) => `${r.date}-${r.reference}-${r.kind}`}
                caption={`Statement for ${supplier.name}`}
                empty={
                  <EmptyState
                    title="Nothing on the account"
                    description="Invoices and payments build the running balance here."
                  />
                }
              />
            ),
          },
          {
            id: "details",
            label: "Details",
            content: (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {[
                  ["Supplier", supplier.name],
                  ["Status", supplier.isActive ? "Active" : "Inactive"],
                  ["Payment terms", `${supplier.paymentTermsDays} days`],
                  ["KRA PIN", supplier.kraPin ?? "—"],
                  ["Phone", supplier.phone ?? "—"],
                  ["Email", supplier.email ?? "—"],
                  ["Last invoice", supplier.lastInvoiceDate ?? "—"],
                  ["Last payment", supplier.lastPaymentDate ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] pb-2">
                    <dt className="text-[var(--text-sm)] text-[var(--text-tertiary)]">{k}</dt>
                    <dd className="text-right text-[var(--text-sm)] font-medium text-[var(--text-primary)]">{v}</dd>
                  </div>
                ))}
              </dl>
            ),
          },
        ]}
      />
    </AppShell>
  );
}
