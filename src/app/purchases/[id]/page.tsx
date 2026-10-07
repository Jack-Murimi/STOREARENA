import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import {
  DataTable, EmptyState, KpiCard, PageHeader, StatusBadge, Tabs,
} from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";
import { PaymentForm } from "./PaymentForm";
import {
  purchaseById, purchaseHistory, purchaseLines, purchasePayments,
  type HistoryEntry, type PurchaseLine, type PurchasePayment,
} from "@/lib/purchases/db";

export const metadata: Metadata = { title: "Purchase invoice" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** A refill and a new cylinder are different purchases even for the same
 *  product. Never collapse these into one label. */
const PURCHASE_TYPE_LABEL: Record<string, string> = {
  refill: "Refill",
  new_cylinder: "New cylinder",
  accessory: "Accessory",
  water: "Water",
  other: "Other",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", mpesa: "M-Pesa", bank: "Bank transfer", cheque: "Cheque",
};

const TONE = {
  posted: "info", paid: "ok", part_paid: "info", unpaid: "warn",
  overdue: "critical", void: "neutral", INSERT: "ok", UPDATE: "info", DELETE: "critical",
} as const;

const lineColumns: DataColumn<PurchaseLine>[] = [
  {
    key: "product", header: "Product", priority: 1,
    cell: (r) => (
      <span>
        <span className="font-medium text-[var(--text-primary)]">{r.productName}</span>
        <span className="block text-[var(--text-xs)] text-[var(--text-tertiary)]">{r.categoryName}</span>
      </span>
    ),
  },
  {
    key: "type", header: "Type", priority: 1,
    cell: (r) => (
      <span
        className={
          r.purchaseType === "new_cylinder"
            ? "font-medium text-[var(--info)]"
            : "text-[var(--text-secondary)]"
        }
      >
        {PURCHASE_TYPE_LABEL[r.purchaseType] ?? r.purchaseType}
      </span>
    ),
  },
  { key: "qty", header: "Qty", align: "right", num: true, priority: 1, cell: (r) => r.quantity.toLocaleString("en-KE") },
  { key: "unit", header: "Unit cost", align: "right", num: true, priority: 2, cell: (r) => formatKsh(r.unitCost) },
  {
    key: "total", header: "Line total", align: "right", num: true, priority: 1,
    cell: (r) => <span className="font-medium">{formatKsh(r.lineTotal)}</span>,
  },
];

const paymentColumns: DataColumn<PurchasePayment>[] = [
  { key: "date", header: "Paid on", priority: 1, cell: (r) => r.paidOn },
  {
    key: "method", header: "Method", priority: 1,
    cell: (r) => METHOD_LABEL[r.method] ?? r.method,
  },
  {
    key: "ref", header: "Reference", priority: 2,
    cell: (r) => <span className="text-[var(--text-secondary)]">{r.reference ?? "—"}</span>,
  },
  {
    key: "amount", header: "Amount", align: "right", num: true, priority: 1,
    cell: (r) => (
      <span className={r.status === "void" ? "text-[var(--text-tertiary)] line-through" : "font-medium"}>
        {formatKsh(r.amount)}
      </span>
    ),
  },
  {
    key: "status", header: "Status", priority: 2,
    cell: (r) => (
      <StatusBadge tone={r.status === "void" ? "neutral" : "ok"}>
        {r.status === "void" ? "Void" : "Posted"}
      </StatusBadge>
    ),
  },
];

const historyColumns: DataColumn<HistoryEntry>[] = [
  { key: "when", header: "When", priority: 1, cell: (r) => r.occurredAt },
  {
    key: "who", header: "Who", priority: 1,
    cell: (r) => (
      <span>
        <span className="font-medium text-[var(--text-primary)]">{r.actor}</span>
        {r.role ? <span className="ml-2 text-[var(--text-xs)] text-[var(--text-tertiary)]">{r.role}</span> : null}
      </span>
    ),
  },
  {
    key: "what", header: "What", priority: 1,
    cell: (r) => (
      <StatusBadge tone={TONE[r.action as keyof typeof TONE] ?? "neutral"}>{r.action}</StatusBadge>
    ),
  },
  {
    key: "fields", header: "Changed", priority: 3,
    cell: (r) => (
      <span className="text-[var(--text-xs)] text-[var(--text-tertiary)]">
        {r.changedFields.length ? r.changedFields.join(", ") : "—"}
      </span>
    ),
  },
  {
    key: "why", header: "Reason", priority: 2,
    cell: (r) => <span className="text-[var(--text-secondary)]">{r.reason ?? "—"}</span>,
  },
];

export default async function PurchaseDetailPage({ params }: Props) {
  const { id } = await params;
  const { products, notice, diagnostic } = await getCustomerContext();

  if (!products) {
    return (
      <AppShell title="Purchase invoice" staff={currentStaff} branch={stationName} activeHref="/purchases">
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const db = products.db;
  const invoice = await purchaseById(db, id);
  if (!invoice) notFound();

  const [lines, payments, history] = await Promise.all([
    purchaseLines(db, id),
    purchasePayments(db, id),
    purchaseHistory(db, id),
  ]);

  const voided = invoice.status === "void";

  return (
    <AppShell
      title={invoice.invoiceNo}
      subtitle={invoice.supplierName}
      staff={currentStaff}
      branch={stationName}
      activeHref="/purchases"
    >
      <PageHeader
        title={invoice.invoiceNo}
        subtitle={`${invoice.supplierName} · ${invoice.branchName} · invoiced ${invoice.invoiceDate}`}
        action={
          <Link
            href={`/suppliers/${invoice.supplierId}`}
            className="inline-flex h-[var(--touch-target)] items-center rounded-lg border border-[var(--line)] bg-white px-4 text-[var(--text-sm)] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
          >
            View supplier
          </Link>
        }
      />

      {voided && invoice.voidReason && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3"
        >
          <span className="mt-0.5 text-[var(--text-tertiary)]" aria-hidden="true">
            ⨯
          </span>
          <p className="text-[var(--text-sm)] text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">Void.</span> {invoice.voidReason}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Invoice total"
          value={formatKsh(invoice.total)}
          subtext={`Subtotal ${formatKsh(invoice.subtotal)} + VAT ${formatKsh(invoice.vatAmount)}`}
        />
        <KpiCard label="Paid" value={formatKsh(invoice.paid)} subtext={`${payments.length} payment${payments.length === 1 ? "" : "s"}`} />
        <KpiCard
          label="Outstanding"
          value={formatKsh(invoice.due)}
          subtext={invoice.due > 0 ? `Due ${invoice.dueDate}` : "Settled"}
        />
        <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]">
          <p className="text-[var(--text-xs)] text-[var(--text-tertiary)]">Status</p>
          <p className="mt-1.5">
            <StatusBadge tone={TONE[invoice.paymentStatus as keyof typeof TONE] ?? "neutral"}>
              {invoice.paymentStatus.replace("_", " ")}
            </StatusBadge>
          </p>
          <p className="mt-1 text-[var(--text-xs)] text-[var(--text-tertiary)]">
            {voided ? "Voided" : `Document v${invoice.version}`}
          </p>
        </div>
      </div>

      <Tabs
        label="Invoice"
        tabs={[
          {
            id: "items",
            label: `Items (${lines.length})`,
            content: (
              <>
                <DataTable
                  columns={lineColumns}
                  rows={lines}
                  rowKey={(r) => String(r.id)}
                  caption={`Items on ${invoice.invoiceNo}`}
                  empty={<EmptyState title="No items" description="This invoice has no lines." />}
                />
                <dl className="ml-auto max-w-xs space-y-1.5 border-t border-[var(--line)] pt-3">
                  {[
                    ["Subtotal", invoice.subtotal],
                    ["VAT", invoice.vatAmount],
                    ["Total", invoice.total],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex items-baseline justify-between gap-4">
                      <dt className="text-[var(--text-sm)] text-[var(--text-tertiary)]">{k}</dt>
                      <dd className={`text-[var(--text-sm)] ${k === "Total" ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                        {formatKsh(v as number)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ),
          },
          {
            id: "payments",
            label: `Payments (${payments.length})`,
            content: (
              <div className="space-y-4">
                <DataTable
                  columns={paymentColumns}
                  rows={payments}
                  rowKey={(r) => r.id}
                  caption={`Payments against ${invoice.invoiceNo}`}
                  empty={
                    <EmptyState
                      title="No payments yet"
                      description="Payments recorded against this invoice will appear here."
                    />
                  }
                />
                {!voided && invoice.due > 0 ? (
                  <PaymentForm
                    invoiceId={invoice.id}
                    supplierId={invoice.supplierId}
                    branchId={invoice.branchId}
                    outstanding={invoice.due}
                  />
                ) : null}
              </div>
            ),
          },
          {
            id: "history",
            label: `History (${history.length})`,
            content: (
              <>
                <DataTable
                  columns={historyColumns}
                  rows={history}
                  rowKey={(r) => r.id}
                  caption={`Audit trail for ${invoice.invoiceNo}`}
                  empty={<EmptyState title="No history" description="Nothing has been recorded for this invoice yet." />}
                />
                {invoice.notes ? (
                  <p className="mt-3 text-[var(--text-sm)] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">Notes.</span> {invoice.notes}
                  </p>
                ) : null}
              </>
            ),
          },
        ]}
      />
    </AppShell>
  );
}
