"use client";

import { useMemo, useState } from "react";
import { saveOpeningStock } from "@/app/inventory/actions";
import { SubmitButton } from "@/components/customers/SubmitButton";
import type { StockRow } from "@/lib/stock/stock-db";
import type { StockLocation } from "@/lib/stock/types";

type Cell = {
  refills: string;
  empties: string;
  unitCostKsh: string;
};

type Draft = Record<string, Cell>;

const today = () => new Date().toISOString().slice(0, 10);
const cellKey = (variantId: string, locationId: string) => `${variantId}::${locationId}`;
const blankCell = (): Cell => ({ refills: "", empties: "", unitCostKsh: "" });

/**
 * The first count sheet. It deliberately posts one JSON payload to one server
 * action; the server turns that payload into an all-or-nothing ledger entry.
 */
export function OpeningStockSetup({
  products,
  branches,
}: {
  products: StockRow[];
  branches: StockLocation[];
}) {
  const [draft, setDraft] = useState<Draft>({});

  const entries = useMemo(
    () =>
      products.flatMap((product) =>
        branches.flatMap((branch) => {
          const values = draft[cellKey(product.variantId, branch.id)];
          if (!values || (!values.refills && !values.empties)) return [];
          return [{
            variantId: product.variantId,
            locationId: branch.id,
            refills: values.refills,
            empties: values.empties,
            unitCostKsh: values.unitCostKsh,
          }];
        }),
      ),
    [branches, draft, products],
  );

  const update = (variantId: string, locationId: string, field: keyof Cell, value: string) => {
    const key = cellKey(variantId, locationId);
    setDraft((current) => ({
      ...current,
      [key]: { ...(current[key] ?? blankCell()), [field]: value },
    }));
  };

  return (
    <form action={saveOpeningStock} className="space-y-4">
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-xs leading-5 text-sky-950">
        <strong>First stock count only.</strong> Full cylinders become FIFO opening lots at the cost
        entered. Empty cylinders receive an EMPTY balance and cylinder custody, but no gas cost.
        Everything below saves together, or nothing saves if any value needs correction.
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-xs uppercase tracking-wide text-ink-soft">
              <th rowSpan={2} className="sticky left-0 z-10 min-w-52 border-r border-line bg-canvas px-3 py-2.5 font-semibold">
                Product
              </th>
              {branches.map((branch) => (
                <th
                  key={branch.id}
                  colSpan={3}
                  className="border-r border-line px-2 py-2.5 text-center font-semibold last:border-r-0"
                >
                  {branch.name}
                </th>
              ))}
            </tr>
            <tr className="border-b border-line bg-canvas/70 text-[11px] uppercase tracking-wide text-ink-soft">
              {branches.flatMap((branch) => [
                <th key={`${branch.id}-refills`} className="min-w-20 px-2 py-2 text-right font-semibold">Full</th>,
                <th key={`${branch.id}-empties`} className="min-w-20 px-2 py-2 text-right font-semibold">Empty</th>,
                <th key={`${branch.id}-cost`} className="min-w-28 border-r border-line px-2 py-2 text-right font-semibold">Unit cost</th>,
              ])}
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {products.map((product) => (
              <tr key={product.variantId} className="hover:bg-canvas/50">
                <th className="sticky left-0 z-10 border-r border-line bg-white px-3 py-2 text-left font-medium text-ink">
                  <span className="block">
                    {product.sizeKg === null ? product.variantName : `${product.sizeKg} KG · ${product.brandName}`}
                  </span>
                  <span className="block text-xs font-normal text-ink-soft">{product.variantName}</span>
                </th>
                {branches.flatMap((branch) => {
                  const values = draft[cellKey(product.variantId, branch.id)] ?? blankCell();
                  const isSimple = product.stockModel === "SIMPLE";
                  return [
                    <td key={`${branch.id}-refills`} className="px-1.5 py-1.5">
                      <input
                        aria-label={`${product.variantName}, ${branch.name}, refill count`}
                        inputMode="numeric"
                        min="0"
                        value={values.refills}
                        onChange={(event) => update(product.variantId, branch.id, "refills", event.target.value)}
                        className="w-full rounded-md border border-line px-2 py-1.5 text-right tabular-nums outline-none focus:border-flame-500"
                      />
                    </td>,
                    <td key={`${branch.id}-empties`} className="px-1.5 py-1.5">
                      <input
                        aria-label={`${product.variantName}, ${branch.name}, empty count`}
                        inputMode="numeric"
                        min="0"
                        value={values.empties}
                        disabled={isSimple}
                        onChange={(event) => update(product.variantId, branch.id, "empties", event.target.value)}
                        placeholder={isSimple ? "—" : ""}
                        className="w-full rounded-md border border-line px-2 py-1.5 text-right tabular-nums outline-none focus:border-flame-500 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-subtle"
                      />
                    </td>,
                    <td key={`${branch.id}-cost`} className="border-r border-line px-1.5 py-1.5">
                      <input
                        aria-label={`${product.variantName}, ${branch.name}, opening unit cost`}
                        inputMode="decimal"
                        min="0"
                        value={values.unitCostKsh}
                        onChange={(event) => update(product.variantId, branch.id, "unitCostKsh", event.target.value)}
                        placeholder="KSh"
                        className="w-full rounded-md border border-line px-2 py-1.5 text-right tabular-nums outline-none focus:border-flame-500"
                      />
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">Opening date</span>
            <input
              type="date"
              name="occurredOn"
              defaultValue={today()}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">Count-sheet reference</span>
            <input
              name="reference"
              placeholder="Optional"
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
            />
          </label>
        </div>
        <div className="text-right">
          <p className="mb-1 text-xs text-ink-soft">{entries.length} branch-product entr{entries.length === 1 ? "y" : "ies"} ready</p>
          <SubmitButton pendingLabel="Saving opening stock…">Save opening stock</SubmitButton>
        </div>
      </div>
    </form>
  );
}
