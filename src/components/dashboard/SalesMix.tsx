import type { PaymentMethod, SaleRecord } from "@/lib/types";
import { formatKsh } from "@/lib/format";
import * as metrics from "@/lib/metrics";
import { Tabs } from "@/components/ui";



/**
 * Where today's takings came from — by size or by payment method, as tabs in
 * one card. It used to be two stacked sections in the same panel, which made
 * the card twice as tall to show the same total twice.
 */
export function SalesMix({ sales }: { sales: SaleRecord[] }) {
  const total = metrics.revenueKsh(sales);

  const bySize = new Map<number, { units: number; revenue: number }>();
  const byPayment = new Map<PaymentMethod, number>();
  for (const sale of sales) {
    const value = metrics.saleValueKsh(sale);
    const size = bySize.get(sale.sizeKg) ?? { units: 0, revenue: 0 };
    bySize.set(sale.sizeKg, { units: size.units + sale.quantity, revenue: size.revenue + value });
    byPayment.set(sale.payment, (byPayment.get(sale.payment) ?? 0) + value);
  }

  const bar = (label: string, value: number, detail: string) => (
    <li key={label} className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-ink">{label}</span>
        <span className="num shrink-0 text-sm text-ink-muted">
          {formatKsh(value)}
          <span className="ml-2 text-xs text-ink-subtle">{detail}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-muted">
        <div
          className="h-full rounded-pill bg-orange-200"
          style={{ width: `${total === 0 ? 0 : (value / total) * 100}%` }}
        />
      </div>
    </li>
  );

  const sizeRows = [...bySize.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const paymentRows = [...byPayment.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Tabs
      label="Sales mix"
      tabs={[
        {
          id: "size",
          label: "By size",
          content:
            sizeRows.length === 0 ? (
              <p className="text-sm text-ink-subtle">No sales recorded yet today.</p>
            ) : (
              <ul className="space-y-2.5">
                {sizeRows.map(([size, value]) =>
                  bar(`${size} kg`, value.revenue, `${value.units} sold`),
                )}
              </ul>
            ),
        },
        {
          id: "payment",
          label: "By payment",
          content:
            paymentRows.length === 0 ? (
              <p className="text-sm text-ink-subtle">No sales recorded yet today.</p>
            ) : (
              <ul className="space-y-2.5">
                {paymentRows.map(([method, value]) =>
                  bar(method, value, `${Math.round((value / total) * 100)}%`),
                )}
              </ul>
            ),
        },
      ]}
    />
  );
}
