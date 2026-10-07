"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { recordAllocatedPayment } from "../actions";

const label = "block text-[var(--text-xs)] font-medium text-[var(--text-secondary)] mb-1.5";
const field =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--orange-400)] focus:ring-2 focus:ring-[var(--orange-100)]";
const num = "w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-right text-[var(--text-sm)] outline-none focus:border-[var(--orange-400)] focus:ring-2 focus:ring-[var(--orange-100)]";

const METHODS = [
  { code: "mpesa", label: "M-Pesa" }, { code: "cash", label: "Cash" },
  { code: "bank", label: "Bank transfer" }, { code: "cheque", label: "Cheque" },
];

export function AllocateForm({
  supplierId, branchId, outstanding,
  invoices,
}: {
  supplierId: string; branchId: string; outstanding: number;
  invoices: { id: string; invoiceNo: string; invoiceDate: string; total: number; due: number }[];
}) {
  const [state, formAction, pending] = useActionState(recordAllocatedPayment, { ok: true });
  const money = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="branch_id" value={branchId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="amount" className={label}>Amount paid *</label>
          <input id="amount" name="amount" type="number" step="0.01" min="0.01" required className={field} placeholder="0.00" />
        </div>
        <div>
          <label htmlFor="method" className={label}>Payment mode *</label>
          <select id="method" name="method" required defaultValue="mpesa" className={field}>
            {METHODS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="paid_on" className={label}>Date paid</label>
          <input id="paid_on" name="paid_on" type="date" className={field} />
        </div>
      </div>
      <div className="sm:max-w-xs">
        <label htmlFor="reference" className={label}>Reference</label>
        <input id="reference" name="reference" className={field} placeholder="e.g. MP4X9K22" />
      </div>

      <div>
        <p className="text-[var(--text-sm)] font-semibold text-[var(--text-primary)]">
          Allocate across pending invoices
        </p>
        <p className="mt-0.5 text-[var(--text-xs)] text-[var(--text-tertiary)]">
          {outstanding.toFixed(2)} outstanding. Leave an invoice blank to skip it. Anything you do not
          allocate is kept as credit on this supplier and can be allocated later.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-[var(--text-sm)]">
            <caption className="sr-only">Pending invoices and how much to allocate from this payment</caption>
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[var(--text-xs)] text-[var(--text-tertiary)]">
                <th scope="col" className="py-2 pr-3 font-medium">Invoice</th>
                <th scope="col" className="py-2 pr-3 font-medium">Invoiced</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Outstanding</th>
                <th scope="col" className="py-2 text-right font-medium">Allocate</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-[var(--line)]">
                  <td className="py-2 pr-3">
                    <span className="font-medium text-[var(--text-primary)]">{i.invoiceNo}</span>
                    <span className="block text-[var(--text-xs)] text-[var(--text-tertiary)]">{i.invoiceDate}</span>
                  </td>
                  <td className="py-2 pr-3 text-[var(--text-secondary)]">{money(i.total)}</td>
                  <td className="py-2 pr-3 text-right text-[var(--text-secondary)]">{money(i.due)}</td>
                  <td className="py-2 text-right">
                    <input
                      type="number" step="0.01" min="0" max={i.due} name={`alloc_${i.id}`}
                      aria-label={`Allocate to ${i.invoiceNo}`} className={num} placeholder="0.00"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {state.ok === false && (
        <p role="alert" className="rounded-lg border border-[var(--critical-border)] bg-[var(--critical-bg)] px-3 py-2 text-[var(--text-sm)] text-[var(--critical)]">
          {state.error}
        </p>
      )}
      <div className="flex justify-end border-t border-[var(--line)] pt-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>
      </div>
    </form>
  );
}
