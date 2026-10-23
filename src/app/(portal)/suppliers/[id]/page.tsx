import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { DataTable, EmptyState, StatusBadge, Tabs } from "@/components/ui";
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
    cell: (r) => <span className="font-medium text-ink">{r.invoiceNo}</span>,
  },
  { key: "branch", header: "Branch", priority: 3, cell: (r) => r.branchName },
  {
    key: "total", header: "Total", align: "right", num: true, priority: 1,
    cell: (r) => <span className="font-medium">{formatKsh(r.total)}</span>,
  },
  {
    key: "paid", header: "Paid", align: "right", num: true, priority: 2,
    cell: (r) => <span className="text-ink-soft">{formatKsh(r.paid)}</span>,
  },
  {
    key: "due", header: "Outstanding", align: "right", num: true, priority: 2,
    cell: (r) => (
      <span className={r.due > 0 ? "font-medium text-warn" : "text-ink-subtle"}>
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
      <span className="text-ink-soft">
        {r.reference}
        <span className="ml-2 text-xs text-ink-subtle">
          {r.kind === "payment" ? "payment" : "invoice"}
        </span>
      </span>
    ),
  },
  {
    key: "debit", header: "Invoiced", align: "right", num: true, priority: 1,
    cell: (r) => (r.debit > 0 ? formatKsh(r.debit) : <span className="text-ink-subtle">—</span>),
  },
  {
    key: "credit", header: "Paid", align: "right", num: true, priority: 1,
    cell: (r) => (r.credit > 0 ? formatKsh(r.credit) : <span className="text-ink-subtle">—</span>),
  },
  {
    key: "running", header: "Balance", align: "right", num: true, priority: 1,
    cell: (r) => (
      <span className={r.running > 0 ? "font-medium text-warn" : "text-ink-soft"}>
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

  const infoRows: [string, string][] = [
    ["KRA PIN", supplier.kraPin ?? "—"],
    ["Phone", supplier.phone ?? "—"],
    ["Email", supplier.email ?? "—"],
    ["Payment terms", `${supplier.paymentTermsDays} days`],
    ["Last invoice", supplier.lastInvoiceDate ?? "—"],
    ["Last payment", supplier.lastPaymentDate ?? "—"],
  ];

  return (
    <AppShell
      title="Suppliers"
      subtitle={supplier.name}
      staff={currentStaff}
      branch={stationName}
      activeHref="/suppliers"
    >
      {/* ── page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/suppliers" className="text-xs font-medium text-ink-soft transition hover:text-ink">
            ← Suppliers
          </Link>
          <h1 className="text-md font-semibold text-ink">{supplier.name}</h1>
          <StatusBadge tone={supplier.isActive ? "ok" : "critical"}>
            {supplier.isActive ? "Active" : "Inactive"}
          </StatusBadge>
        </div>
        <Link
          href="/purchases/new"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-flame-500 px-4 text-sm font-semibold text-white transition hover:bg-flame-600"
        >
          New invoice
        </Link>
      </div>

      {/* ── two-column layout ── */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[340px_1fr] lg:gap-6">

        {/* SIDE — supplier info card */}
        <aside className="flex flex-col gap-4 lg:order-1">
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">

            {/* compact summary strip */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-5 py-3">
              <span className="text-xs text-ink-soft">
                Billed{" "}
                <span className="num font-semibold text-ink">{formatKsh(supplier.totalBilled)}</span>
              </span>
              <span className="text-ink-subtle">·</span>
              <span className="text-xs text-ink-soft">
                Paid{" "}
                <span className="num font-semibold text-ink">{formatKsh(supplier.totalPaid)}</span>
              </span>
              <span className="text-ink-subtle">·</span>
              <span className="text-xs text-ink-soft">
                We owe{" "}
                <span className={`num font-semibold ${supplier.balance > 0 ? "text-warn" : "text-ok"}`}>
                  {supplier.balance > 0 ? formatKsh(supplier.balance) : "Settled"}
                </span>
              </span>
              {supplier.overdueAmount > 0 && (
                <>
                  <span className="text-ink-subtle">·</span>
                  <span className="text-xs text-ink-soft">
                    Overdue{" "}
                    <span className="num font-semibold text-critical">{formatKsh(supplier.overdueAmount)}</span>
                  </span>
                </>
              )}
            </div>

            {/* supplier info */}
            <dl className="divide-y divide-line">
              {infoRows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-2.5">
                  <dt className="text-xs text-ink-soft shrink-0">{k}</dt>
                  <dd className="text-right text-sm font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>

            {/* ageing */}
            <div className="border-t border-line px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Ageing
              </p>
              <dl className="grid grid-cols-5 gap-2">
                {ageingRows.map((a) => (
                  <div key={a.key} className="rounded-lg border border-line bg-canvas px-2 py-2 text-center">
                    <dt className="text-xs text-ink-subtle">{a.label}</dt>
                    <dd
                      className={`num mt-0.5 text-sm font-semibold ${
                        a.value > 0 && (a.key === "d61_90" || a.key === "d90Plus")
                          ? "text-critical"
                          : a.value > 0
                          ? "text-warn"
                          : "text-ink-subtle"
                      }`}
                    >
                      {formatKsh(a.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* invoices count footer */}
            <p className="border-t border-line px-5 py-2 text-xs text-ink-subtle">
              {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · {paidCount} settled
            </p>
          </div>
        </aside>

        {/* MAIN — tabs */}
        <main className="min-w-0 lg:order-2">
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
            <div className="px-5 py-4">
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
                        rowLabel={(r) => r.invoiceNo}
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
                          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                            <dt className="text-sm text-ink-soft">{k}</dt>
                            <dd className="text-right text-sm font-medium text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
