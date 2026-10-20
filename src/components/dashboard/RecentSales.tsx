import type { SaleRecord } from "@/lib/types";
import { formatCylinder, formatKsh } from "@/lib/format";
import * as metrics from "@/lib/metrics";

/**
 * The latest few sale *lines*, and a count of the rest.
 *
 * The dashboard query is line-level because a receipt can hold several
 * products, so the key must be the line id. Using the receipt id here made
 * every multi-line sale render duplicate React keys.
 */
export function RecentSales({ sales, limit = 6 }: { sales: SaleRecord[]; limit?: number }) {
  const shown = sales.slice(0, limit);
  const receipts = metrics.salesCount(sales);

  if (shown.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-ink-subtle">No sales yet today.</p>;
  }

  return (
    <ul className="divide-line divide-y">
      {shown.map((sale) => (
        <li key={sale.lineId} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{sale.customer}</p>
            <p className="truncate text-xs text-ink-subtle">
              {sale.time} · {sale.quantity} ×{" "}
              {sale.isCylinder && sale.sizeKg ? formatCylinder(sale.sizeKg) : "item"} ·{" "}
              {sale.payment}
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
            {sales.length - shown.length} more line
            {sales.length - shown.length === 1 ? "" : "s"} on {receipts} receipt
            {receipts === 1 ? "" : "s"} today
          </span>
        </li>
      ) : null}
    </ul>
  );
}
