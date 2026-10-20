"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { voidSale, type VoidSaleState } from "../actions";

const initial: VoidSaleState = {};

export function VoidSaleForm({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(voidSale, initial);
  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-critical bg-critical-bg p-4">
      <input type="hidden" name="sale_id" value={saleId} />
      <div>
        <h2 className="text-base font-semibold text-ink">Void this sale</h2>
        <p className="mt-1 text-sm text-ink-muted">This does not delete anything. It creates reversing stock movements and retains the audit trail.</p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-ink-muted">Reason</span>
        <textarea name="reason" required minLength={10} rows={3} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink" placeholder="Explain why this sale must be voided" />
      </label>
      {state.error ? <p role="alert" className="text-sm font-medium text-critical">{state.error}</p> : null}
      {state.success ? <p className="text-sm font-medium text-ok">Sale voided. The receipt is refreshing.</p> : null}
      <Button type="submit" variant="danger" disabled={pending}>{pending ? "Voiding…" : "Void sale"}</Button>
    </form>
  );
}
