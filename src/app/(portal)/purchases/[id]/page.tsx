import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import {
  DataTable, EmptyState, StatusBadge, Tabs,
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
        <span className="font-medium text-ink">{r.productName}</span>
        <span className="block text-xs text-ink-soft">{r.categoryName}</span>
      </span>
    ),
  },
  {
    key: "type", header: "Type", priority: 1,
    cell: (r) => (
      <span className={r.purchaseType === "new_cylinder" ? "font-medium text-info" : "text-ink-soft"}>
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
    cell: (r) => <span className="text-ink-soft">{r.reference ?? "—"}</span>,
  },
  {
    key: "amount", header: "Amount", align: "right", num: true, priority: 1,
    cell: (r) => (
      <span className={r.status === "void" ? "text-ink-subtle line-through" : "font-medium"}>
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
        <span className="font-medium text-ink">{r.actor}</span>
        {r.role ? <span className="ml-2 text-xs text-ink-soft">{r.role}</span> : null}
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
      <span className="text-xs text-ink-soft">
        {r.changedFields.length ? r.changedFields.join(", ") : "—"}
      </span>
    ),
  },
  {
    key: "why", header: "Reason", priority: 2,
    cell: (r) => <span className="text-ink-soft">{r.reason ?? "—"}</span>,
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
      title="Purchases"
      staff={currentStaff}
      branch={stationName}
      activeHref="/purchases"
    >
      {/* ── back + page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/purchases" className="text-xs font-medium text-ink-soft hover:text-ink transition">
            ← All purchases
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-md font-semibold text-ink">{invoice.supplierName}</h1>
            <span className="code rounded bg-surface-muted px-2 py-0.5 text-ink-soft">{invoice.invoiceNo}</span>
            <StatusBadge tone={TONE[invoice.paymentStatus as keyof typeof TONE] ?? "neutral"}>
              {invoice.paymentStatus.replace("_", " ")}
            </StatusBadge>
            {voided && <StatusBadge tone="neutral">Void</StatusBadge>}
          </div>
        </div>
        <Link
          href={`/suppliers/${invoice.supplierId}`}
          className="inline-flex h-9 items-center rounded-lg border border-line bg-card px-4 text-xs font-semibold text-ink hover:bg-canvas transition"
        >
          View supplier
        </Link>
      </div>

      {voided && invoice.voidReason && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
          <span className="mt-0.5 text-ink-soft" aria-hidden="true">⨯</span>
          <p className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">Void.</span> {invoice.voidReason}
          </p>
        </div>
      )}

      {/* ── compact summary strip ── */}
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="text-xs uppercase tracking-wide text-ink-soft">Total</span>
            <span className="num ml-1.5 font-semibold text-ink">{formatKsh(invoice.total)}</span>
            <span className="ml-1 text-xs text-ink-soft">(sub {formatKsh(invoice.subtotal)} + VAT {formatKsh(invoice.vatAmount)})</span>
          </span>
          <span className="text-ink-soft/40">·</span>
          <span>
            <span className="text-xs uppercase tracking-wide text-ink-soft">Paid</span>
            <span className="num ml-1.5 font-semibold text-ink">{formatKsh(invoice.paid)}</span>
            <span className="ml-1 text-xs text-ink-soft">{payments.length} payment{payments.length === 1 ? "" : "s"}</span>
          </span>
          <span className="text-ink-soft/40">·</span>
          <span>
            <span className="text-xs uppercase tracking-wide text-ink-soft">Outstanding</span>
            <span className={`num ml-1.5 font-semibold ${invoice.due > 0 ? "text-critical" : "text-ok"}`}>
              {invoice.due > 0 ? formatKsh(invoice.due) : "Settled"}
            </span>
            {invoice.due > 0 && (
              <span className="ml-1 text-xs text-ink-soft">due {invoice.dueDate}</span>
            )}
          </span>
          <span className="text-ink-soft/40">·</span>
          <span>
            <span className="text-xs uppercase tracking-wide text-ink-soft">Invoiced</span>
            <span className="ml-1.5 text-ink-soft">{invoice.invoiceDate}</span>
          </span>
          {!voided && (
            <>
              <span className="text-ink-soft/40">·</span>
              <span className="text-xs text-ink-soft">v{invoice.version}</span>
            </>
          )}
        </div>
      </div>

      {/* ── two-column layout ── */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">

        {/* side — record payment; appears first on mobile */}
        {!voided && (
          <aside className="lg:order-2">
            <details
              className="overflow-hidden rounded-xl border border-line bg-card shadow-card"
              open={invoice.due > 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 hover:bg-canvas">
                <span className="text-sm font-semibold text-ink">Record payment</span>
                {invoice.due > 0 ? (
                  <span className="num text-xs font-semibold text-critical">{formatKsh(invoice.due)} outstanding</span>
                ) : (
                  <span className="text-xs text-ok">Settled</span>
                )}
              </summary>
              <div className="border-t border-line p-5">
                <PaymentForm
                  invoiceId={invoice.id}
                  supplierId={invoice.supplierId}
                  branchId={invoice.branchId}
                  outstanding={invoice.due}
                />
              </div>
            </details>
          </aside>
        )}

        {/* main — line items + payments + history tabs */}
        <main className="min-w-0 lg:order-1">
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
                    <dl className="ml-auto max-w-xs space-y-1.5 border-t border-line pt-3">
                      {[
                        ["Subtotal", invoice.subtotal],
                        ["VAT", invoice.vatAmount],
                        ["Total", invoice.total],
                      ].map(([k, v]) => (
                        <div key={k as string} className="flex items-baseline justify-between gap-4">
                          <dt className="text-sm text-ink-soft">{k}</dt>
                          <dd className={`text-sm ${k === "Total" ? "font-semibold text-ink" : "text-ink-soft"}`}>
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
                      <p className="mt-3 text-sm text-ink-soft">
                        <span className="font-semibold text-ink">Notes.</span> {invoice.notes}
                      </p>
                    ) : null}
                  </>
                ),
              },
            ]}
          />
        </main>
      </div>
    </AppShell>
  );
}
