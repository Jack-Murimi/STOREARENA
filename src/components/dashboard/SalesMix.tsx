import type { PaymentMethod, SaleRecord } from "@/lib/types";
import { revenueKsh, saleValueKsh } from "@/lib/metrics";
import { formatCylinder, formatKsh } from "@/lib/format";

interface SalesMixProps {
  sales: SaleRecord[];
}

/**
 * Where today's takings came from: split by cylinder size, then by payment
 * method. Both breakdowns are derived from the same sale records so they can
 * never disagree with the KPI row.
 */
export function SalesMix({ sales }: SalesMixProps) {
  const total = revenueKsh(sales);

  const bySize = new Map<number, { units: number; revenue: number }>();
  const byPayment = new Map<PaymentMethod, number>();

  for (const sale of sales) {
    const value = saleValueKsh(sale);
    const size = bySize.get(sale.sizeKg) ?? { units: 0, revenue: 0 };
    size.units += sale.quantity;
    size.revenue += value;
    bySize.set(sale.sizeKg, size);

    byPayment.set(sale.payment, (byPayment.get(sale.payment) ?? 0) + value);
  }

  const sizeRows = [...bySize.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue);
  const maxRevenue = Math.max(...sizeRows.map(([, row]) => row.revenue), 1);
  const paymentRows = [...byPayment.entries()].sort((a, b) => b[1] - a[1]);

  const share = (value: number) =>
    total === 0 ? 0 : Math.round((value / total) * 100);

  return (
    <div className="space-y-6">
      <div>
        <p className="pb-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
          Takings by cylinder size
        </p>
        {sizeRows.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No sales recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {sizeRows.map(([sizeKg, row]) => (
              <li key={sizeKg}>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="font-medium text-ink">
                    {formatCylinder(sizeKg)}
                    <span className="ml-1.5 text-ink-faint">{row.units} sold</span>
                  </span>
                  <span className="font-mono text-ink-soft tabular-nums">
                    {formatKsh(row.revenue)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-navy-700"
                    style={{ width: `${Math.max(2, (row.revenue / maxRevenue) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="pb-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
          Payment methods
        </p>
        {paymentRows.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Nothing to reconcile yet.</p>
        ) : (
          <ul className="divide-line rounded-lg border border-line">
            {paymentRows.map(([method, value]) => (
              <li
                key={method}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]"
              >
                <span className="text-ink">{method}</span>
                <span className="text-right">
                  <span className="block font-mono text-[13px] font-medium text-ink tabular-nums">
                    {formatKsh(value)}
                  </span>
                  <span className="block text-[11px] text-ink-faint">
                    {share(value)}% of takings
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
