"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { createSupplier } from "../actions";

const label = "block text-[var(--text-xs)] font-medium text-[var(--text-secondary)] mb-1.5";
const field =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--orange-400)] focus:ring-2 focus:ring-[var(--orange-100)]";

export function SupplierForm() {
  const [state, formAction, pending] = useActionState(createSupplier, { ok: true });

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="name" className={label}>Supplier name *</label>
        <input id="name" name="name" required minLength={2} className={field} placeholder="e.g. TotalEnergies Kenya" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className={label}>Phone</label>
          <input id="phone" name="phone" type="tel" className={field} placeholder="0700 000 000" />
        </div>
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input id="email" name="email" type="email" className={field} placeholder="accounts@supplier.co.ke" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="kra_pin" className={label}>KRA PIN</label>
          <input id="kra_pin" name="kra_pin" className={field} placeholder="A012345678Z" />
        </div>
        <div>
          <label htmlFor="payment_terms_days" className={label}>Payment terms (days)</label>
          <input id="payment_terms_days" name="payment_terms_days" type="number" min={0} max={365} defaultValue={30} className={field} />
          <p className="mt-1 text-[var(--text-xs)] text-[var(--text-tertiary)]">Used to work out the due date on new invoices.</p>
        </div>
      </div>

      {state.ok === false && (
        <p role="alert" className="rounded-lg border border-[var(--critical-border)] bg-[var(--critical-bg)] px-3 py-2 text-[var(--text-sm)] text-[var(--critical)]">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save supplier"}</Button>
      </div>
    </form>
  );
}
