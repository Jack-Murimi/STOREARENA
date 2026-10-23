"use client";

import { useState } from "react";
import type { Invoice, Payment } from "@/lib/billing";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/billing";
import { recordPayment, cancelInvoice } from "@/app/(portal)/customers/actions";
import { SubmitButton } from "./SubmitButton";
import { InvoiceForm } from "./InvoiceForm";

type Tab = "all" | "invoices" | "payments";

type LedgerEntry =
  | { kind: "invoice"; date: string; item: Invoice }
  | { kind: "payment"; date: string; item: Payment };

function invoiceStatus(invoice: Invoice): { label: string; color: string } {
  if (invoice.cancelled) return { label: "Cancelled", color: "text-ink-soft bg-canvas" };
  if (invoice.outstanding <= 0) return { label: "Settled", color: "text-good bg-good-soft" };
  if (invoice.allocated > 0) return { label: "Part-paid", color: "text-warn bg-warn-soft" };
  return { label: "Open", color: "text-bad bg-bad-soft" };
}

const ksh = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;

const controlClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500 focus:ring-2 focus:ring-flame-400/20";

function InvoiceIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-ink-soft"
      aria-hidden
    >
      <rect x="3" y="1" width="10" height="14" rx="1.5" />
      <path d="M6 5h4M6 8h4M6 11h2" />
    </svg>
  );
}

function PaymentIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-good"
      aria-hidden
    >
      <path d="M3 8l3.5 3.5L13 4" />
    </svg>
  );
}

export function ActivityLedger({
  customerId,
  invoices,
  payments,
  showBilling,
}: {
  customerId: string;
  invoices: Invoice[];
  payments: Payment[];
  showBilling: boolean;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  if (!showBilling) {
    return (
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
        <div className="px-5 py-4 text-sm text-ink-soft">
          Balances and invoices are visible to managers. Ask a manager if you need them.
        </div>
      </div>
    );
  }

  const allEntries: LedgerEntry[] = [
    ...invoices.map((i) => ({ kind: "invoice" as const, date: i.issuedOn, item: i })),
    ...payments.map((p) => ({ kind: "payment" as const, date: p.receivedOn, item: p })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const visible =
    tab === "invoices"
      ? allEntries.filter((e) => e.kind === "invoice")
      : tab === "payments"
        ? allEntries.filter((e) => e.kind === "payment")
        : allEntries;

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "invoices", label: "Invoices" },
    { id: "payments", label: "Payments" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-semibold tracking-tight text-ink">Activity</h2>
          <div className="flex items-center gap-0.5 rounded-lg bg-canvas p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  tab === t.id
                    ? "bg-white text-ink shadow-card"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInvoiceOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-flame-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-flame-600"
          >
            {invoiceOpen ? "Cancel" : "+ Raise invoice"}
          </button>
        </div>
      </div>

      {/* Invoice form panel */}
      {invoiceOpen && (
        <div className="border-b border-line bg-canvas/60 px-5 py-4">
          <InvoiceForm customerId={customerId} />
        </div>
      )}

      {/* Payment form */}
      <details className="group border-b border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-xs font-semibold text-ink-soft hover:text-ink">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="transition group-open:rotate-90"
            aria-hidden
          >
            <path d="M4 2l4 4-4 4" />
          </svg>
          Record payment
        </summary>
        <form
          action={recordPayment}
          className="grid gap-2 border-t border-line bg-canvas/40 px-5 py-3 sm:grid-cols-[130px_1fr_150px_130px_auto]"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="e.g. 2400"
            className={controlClass}
          />
          <input
            name="reference"
            placeholder="M-Pesa code / cheque no."
            className={controlClass}
          />
          <select name="method" defaultValue="MPESA" className={controlClass}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="receivedOn"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={controlClass}
          />
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        </form>
      </details>

      {/* Ledger */}
      {visible.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-5 text-sm text-ink-soft">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="shrink-0 text-ink-soft/50"
            aria-hidden
          >
            <rect x="3" y="1" width="10" height="14" rx="1.5" />
            <path d="M6 5h4M6 8h3" />
          </svg>
          {tab === "payments"
            ? "No payments recorded yet."
            : tab === "invoices"
              ? "No invoices yet."
              : "No activity yet — "}
          {tab !== "payments" && (
            <button
              type="button"
              onClick={() => setInvoiceOpen(true)}
              className="font-medium text-orange-700 hover:underline"
            >
              raise the first invoice →
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <th className="w-8 px-5 py-2.5" />
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Reference</th>
                <th className="px-3 py-2.5">Details</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((entry) => {
                if (entry.kind === "invoice") {
                  const inv = entry.item;
                  const status = invoiceStatus(inv);
                  const desc = inv.lines
                    .map((l) => `${l.quantity} × ${l.description}`)
                    .join(", ");
                  return (
                    <tr key={`inv-${inv.id}`} className="text-sm hover:bg-canvas/60">
                      <td className="px-5 py-3">
                        <InvoiceIcon />
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-soft">{inv.issuedOn}</td>
                      <td className="px-3 py-3">
                        <span className="code text-ink-soft">{inv.reference}</span>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-xs text-ink-soft">
                        {desc || inv.notes || "—"}
                      </td>
                      <td className="px-3 py-3 text-right num font-semibold text-ink">
                        {ksh(inv.total)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                } else {
                  const pay = entry.item;
                  return (
                    <tr key={`pay-${pay.id}`} className="text-sm hover:bg-canvas/60">
                      <td className="px-5 py-3">
                        <PaymentIcon />
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-soft">{pay.receivedOn}</td>
                      <td className="px-3 py-3">
                        <span className="code text-ink-soft">{pay.reference ?? "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-soft">
                        {PAYMENT_METHOD_LABELS[pay.method]}
                        {pay.allocations.length > 0
                          ? ` · ${pay.allocations.map((a) => a.invoiceReference).join(", ")}`
                          : " · On account"}
                      </td>
                      <td className="px-3 py-3 text-right num font-semibold text-good">
                        {ksh(pay.amount)}
                      </td>
                      <td className="px-5 py-3" />
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
