import type { SaleRecord } from "@/lib/types";
import { formatCylinder, formatKsh } from "@/lib/format";
import * as metrics from "@/lib/metrics";

/**
 * The latest few sales, and a link to the rest.
 *
 * No inner scrollbar: a scrolling list inside a scrolling page means two
 * scrollbars fighting over the same gesture, and on a phone you cannot tell
 * which one you are moving.
 */
export function RecentSales({ sales, limit = 6 }: { sales: SaleRecord[]; limit?: number }) {
  const shown = sales.slice(0, limit);

  if (shown.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-ink-subtle">No sales yet today.</p>;
  }

  return (
    <ul className="divide-line divide-y">
      {shown.map((sale) => (
        <li key={sale.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{sale.customer}</p>
            <p className="truncate text-xs text-ink-subtle">
              {sale.time} · {sale.quantity} × {formatCylinder(sale.sizeKg)} ·{" "}
              {sale.payment.replace("_", " ")}
            </p>
          </div>
          <span className="num shrink-0 text-sm font-semibold text-ink">
            {formatKsh(metrics.saleValueKsh(sale))}
          </span>
        </li>
      ))}
      {sales.length > shown.length ? (
        <li className="px-4 py-2">
          <span className="text-sm text-ink-subtle">
            {sales.length - shown.length} earlier today
          </span>
        </li>
      ) : null}
    </ul>
  );
}
