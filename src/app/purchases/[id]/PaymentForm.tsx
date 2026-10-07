"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { recordPayment } from "../actions";

const label = "block text-[var(--text-xs)] font-medium text-[var(--text-secondary)] mb-1.5";
const field =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--orange-400)] focus:ring-2 focus:ring-[var(--orange-100)]";

/** Display labels only. The server maps these to the codes the column accepts. */
const METHODS = [
  { code: "mpesa", label: "M-Pesa" },
  { code: "cash", label: "Cash" },
  { code: "bank", label: "Bank transfer" },
  { code: "cheque", label: "Cheque" },
];

export function PaymentForm({
  invoiceId, supplierId, branchId, outstanding,
}: {
  invoiceId: string; supplierId: string; branchId: string; outstanding: number;
}) {
  const [state, formAction, pending] = useActionState(recordPayment, { ok: true });

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
      <p className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">
        Record a payment
        <span className="ml-2 font-normal text-[var(--text-tertiary)]">
          {outstanding.toFixed(2)} outstanding
        </span>
      </p>

      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="branch_id" value={branchId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="amount" className={label}>Amount *</label>
          <input
            id="amount" name="amount" type="number" step="0.01" min="0.01" max={outstanding}
            required className={field} placeholder="0.00"
          />
        </div>
        <div>
          <label htmlFor="method" className={label}>Method *</label>
          <select id="method" name="method" required defaultValue="mpesa" className={field}>
            {METHODS.map((m) => (
              <option key={m.code} value={m.code}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reference" className={label}>Reference</label>
          <input id="reference" name="reference" className={field} placeholder="e.g. MP4X9K22" />
        </div>
      </div>

      <div className="sm:max-w-xs">
        <label htmlFor="paid_on" className={label}>Paid on</label>
        <input id="paid_on" name="paid_on" type="date" className={field} />
      </div>

      {state.ok === false && (
        <p role="alert" className="rounded-lg border border-[var(--critical-border)] bg-[var(--critical-bg)] px-3 py-2 text-[var(--text-sm)] text-[var(--critical)]">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>
      </div>
    </form>
  );
}
