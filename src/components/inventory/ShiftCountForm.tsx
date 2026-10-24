"use client";

import { useMemo, useState } from "react";
import { saveShiftCount } from "@/app/(portal)/inventory/shift-count-actions";
import { SubmitButton } from "@/components/customers/SubmitButton";

export interface ShiftCountProduct {
  variantId: string;
  variantName: string;
  brandName: string;
  sizeKg: number | null;
  ledgerRefills: number;
  ledgerEmpties: number;
}

interface Draft {
  refills: string;
  empties: string;
}

function varianceBadge(counted: number, ledger: number) {
  const diff = counted - ledger;
  if (diff === 0) return null;
  const positive = diff > 0;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
        positive
          ? "bg-amber-100 text-amber-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {positive ? `+${diff} extra` : `${diff} short`}
    </span>
  );
}

export function ShiftCountForm({
  products,
  locationId,
  branchName,
  countDate,
}: {
  products: ShiftCountProduct[];
  locationId: string;
  branchName: string;
  countDate: string;
}) {
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [note, setNote] = useState("");

  const update = (variantId: string, field: keyof Draft, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [variantId]: { ...(prev[variantId] ?? { refills: "", empties: "" }), [field]: value },
    }));
  };

  const entries = useMemo(
    () =>
      products.map((p) => ({
        variantId: p.variantId,
        refills: Number(draft[p.variantId]?.refills || 0),
        empties: Number(draft[p.variantId]?.empties || 0),
      })),
    [draft, products],
  );

  const filledCount = entries.filter((e) => draft[e.variantId]).length;

  return (
    <form action={saveShiftCount} className="pb-24">
      {/* Hidden fields */}
      <input type="hidden" name="location_id" value={locationId} />
      <input type="hidden" name="count_date" value={countDate} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />
      <input type="hidden" name="note" value={note} />

      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{branchName}</p>
            <p className="text-xs text-ink-soft">{countDate} · {filledCount}/{products.length} counted</p>
          </div>
          <SubmitButton pendingLabel="Saving…">
            Save count
          </SubmitButton>
        </div>
      </div>

      {/* Note field */}
      <div className="mt-4">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. found one cylinder with no label"
            className="h-11 w-full rounded-xl border border-line bg-white px-4 text-sm outline-none focus:border-flame-500"
          />
        </label>
      </div>

      {/* Product cards */}
      <div className="mt-4 space-y-3">
        {products.map((product) => {
          const d = draft[product.variantId];
          const countedRefills = d ? Number(d.refills || 0) : product.ledgerRefills;
          const countedEmpties = d ? Number(d.empties || 0) : product.ledgerEmpties;
          const touched = !!d;

          const refillVariance = touched ? countedRefills - product.ledgerRefills : 0;
          const emptyVariance = touched ? countedEmpties - product.ledgerEmpties : 0;
          const hasVariance = touched && (refillVariance !== 0 || emptyVariance !== 0);

          return (
            <div
              key={product.variantId}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                hasVariance ? "border-amber-300" : "border-line"
              }`}
            >
              {/* Product header */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold leading-tight text-ink">
                    {product.sizeKg !== null ? `${product.sizeKg} KG` : product.variantName}
                  </p>
                  <p className="text-sm text-ink-soft">{product.brandName}</p>
                </div>
                {hasVariance && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                    Variance
                  </span>
                )}
              </div>

              {/* Input grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Full cylinders */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Full cylinders
                  </label>
                  <input
                    aria-label={`${product.variantName} full cylinders`}
                    inputMode="numeric"
                    min="0"
                    value={d?.refills ?? ""}
                    placeholder={String(product.ledgerRefills)}
                    onChange={(e) => update(product.variantId, "refills", e.target.value)}
                    className="h-14 w-full rounded-xl border border-line bg-canvas px-3 text-center text-2xl font-bold tabular-nums outline-none focus:border-flame-500 focus:bg-white"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-soft">System: {product.ledgerRefills}</span>
                    {touched && varianceBadge(countedRefills, product.ledgerRefills)}
                  </div>
                </div>

                {/* Empty cylinders */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Empty cylinders
                  </label>
                  <input
                    aria-label={`${product.variantName} empty cylinders`}
                    inputMode="numeric"
                    min="0"
                    value={d?.empties ?? ""}
                    placeholder={String(product.ledgerEmpties)}
                    onChange={(e) => update(product.variantId, "empties", e.target.value)}
                    className="h-14 w-full rounded-xl border border-line bg-canvas px-3 text-center text-2xl font-bold tabular-nums outline-none focus:border-flame-500 focus:bg-white"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-soft">System: {product.ledgerEmpties}</span>
                    {touched && varianceBadge(countedEmpties, product.ledgerEmpties)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom save bar (fallback for short lists) */}
      <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <p className="text-sm text-ink-soft">
          {filledCount === 0
            ? "Enter counts above"
            : `${filledCount} product${filledCount === 1 ? "" : "s"} counted`}
        </p>
        <SubmitButton pendingLabel="Saving…">Save count</SubmitButton>
      </div>
    </form>
  );
}
