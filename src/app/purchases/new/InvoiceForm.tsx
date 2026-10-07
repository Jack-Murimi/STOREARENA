"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { createPurchase, type PurchaseFormState } from "../actions";
import { formatKsh } from "@/lib/format";

export interface Option {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
}

interface Line {
  product_id: string;
  purchase_type: string;
  quantity: string;
  unit_cost: string;
}

const TYPES = [
  { value: "refill", label: "Refill" },
  { value: "new_cylinder", label: "New cylinder" },
  { value: "accessory", label: "Accessory" },
  { value: "water", label: "Water" },
  { value: "other", label: "Other" },
];

const empty: Line = { product_id: "", purchase_type: "refill", quantity: "1", unit_cost: "" };
const initialState: PurchaseFormState = {};

const field =
  "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-ink focus:border-orange-500 focus:outline-none";

export function InvoiceForm({
  suppliers,
  branches,
  products,
  defaultBranchId,
  branchLocked,
}: {
  suppliers: { id: string; name: string; paymentTermsDays: number }[];
  branches: { id: string; name: string }[];
  products: Option[];
  defaultBranchId: string;
  branchLocked: boolean;
}) {
  const [state, action, pending] = useActionState(createPurchase, initialState);
  const [lines, setLines] = useState<Line[]>([{ ...empty }]);
  const [vatOn, setVatOn] = useState(false);
  const [terms, setTerms] = useState(0);

  const grouped = useMemo(() => {
    const map = new Map<string, Option[]>();
    for (const p of products) {
      const list = map.get(p.categoryName) ?? [];
      list.push(p);
      map.set(p.categoryName, list);
    }
    return [...map.entries()];
  }, [products]);

  const subtotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0),
    0,
  );
  const vat = vatOn ? subtotal * 0.16 : 0;
  const total = subtotal + vat;

  const set = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          lines.filter((l) => l.product_id && Number(l.quantity) > 0),
        )}
      />
      <input type="hidden" name="vat_rate" value={vatOn ? 16 : 0} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-ink-subtle">Supplier</span>
          <select
            name="supplier_id"
            required
            className={field}
            onChange={(e) =>
              setTerms(suppliers.find((s) => s.id === e.target.value)?.paymentTermsDays ?? 0)
            }
          >
            <option value="">Choose a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs text-ink-subtle">Branch</span>
          <select name="branch_id" required className={field} defaultValue={defaultBranchId} disabled={branchLocked}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {branchLocked ? <input type="hidden" name="branch_id" value={defaultBranchId} /> : null}
        </label>

        <label className="space-y-1">
          <span className="text-xs text-ink-subtle">Invoice no</span>
          <input name="invoice_no" required placeholder="GVK-0001" className={field} />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-ink-subtle">Invoice date</span>
          <input
            type="date"
            name="invoice_date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={field}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-ink-subtle">Due date</span>
          <input
            type="date"
            name="due_date"
            defaultValue={dueDate(terms)}
            className={field}
          />
          <span className="text-xs text-ink-subtle">Supplier terms: {terms} days</span>
        </label>

        <label className="space-y-1">
          <span className="text-xs text-ink-subtle">Recorded by</span>
          <input name="actor" defaultValue="Portal" required minLength={2} className={field} />
        </label>
      </div>

      <section className="rounded-lg border border-border">
        <header className="flex min-h-[var(--row-table)] items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold text-ink">Lines</h2>
          <Button type="button" size="sm" onClick={() => setLines((p) => [...p, { ...empty }])}>
            Add line
          </Button>
        </header>

        <div className="divide-line divide-y">
          {lines.map((line, index) => {
            const lineTotal = (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0);
            return (
              <div key={index} className="grid gap-2 px-4 py-2 sm:grid-cols-[1fr_120px_80px_110px_100px_auto] sm:items-center">
                <select
                  required
                  className={field}
                  value={line.product_id}
                  onChange={(e) => set(index, { product_id: e.target.value })}
                >
                  <option value="">Product…</option>
                  {grouped.map(([category, options]) => (
                    <optgroup key={category} label={category}>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  className={field}
                  value={line.purchase_type}
                  onChange={(e) => set(index, { purchase_type: e.target.value })}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  className={`${field} num`}
                  value={line.quantity}
                  onChange={(e) => set(index, { quantity: e.target.value })}
                  aria-label="Quantity"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className={`${field} num`}
                  value={line.unit_cost}
                  onChange={(e) => set(index, { unit_cost: e.target.value })}
                  aria-label="Unit cost"
                />
                <span className="num text-right text-sm text-ink">{formatKsh(lineTotal)}</span>
                <button
                  type="button"
                  onClick={() => setLines((p) => p.filter((_, i) => i !== index))}
                  disabled={lines.length === 1}
                  className="h-9 w-9 rounded-md text-ink-subtle hover:bg-surface-muted disabled:opacity-40"
                  aria-label="Remove line"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} />
          Add VAT at 16%
        </label>
        <dl className="num space-y-0.5 text-right text-sm">
          <div className="flex justify-end gap-4">
            <dt className="text-ink-subtle">Subtotal</dt>
            <dd>{formatKsh(subtotal)}</dd>
          </div>
          <div className="flex justify-end gap-4">
            <dt className="text-ink-subtle">VAT</dt>
            <dd>{formatKsh(vat)}</dd>
          </div>
          <div className="flex justify-end gap-4 text-md font-semibold text-ink">
            <dt>Total</dt>
            <dd>{formatKsh(total)}</dd>
          </div>
        </dl>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-critical bg-critical-bg px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save invoice"}
        </Button>
        <a href="/purchases" className="text-sm text-orange-700 hover:underline">
          Cancel
        </a>
      </div>
    </form>
  );
}

function dueDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
