import type { SaleRecord, PaymentMethod } from "@/lib/types";
import { saleValueKsh } from "@/lib/metrics";
import { formatCylinder, formatKsh } from "@/lib/format";
import { CardIcon, CashIcon, PhoneIcon } from "@/components/icons";
import { Pill } from "./Panel";

interface RecentSalesProps {
  sales: SaleRecord[];
  limit?: number;
}

const paymentIcons: Record<PaymentMethod, typeof CashIcon> = {
  "M-Pesa": PhoneIcon,
  Cash: CashIcon,
  Card: CardIcon,
  "Bank Transfer": CardIcon,
};

export function RecentSales({ sales, limit = 6 }: RecentSalesProps) {
  const rows = sales.slice(0, limit);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-ink-soft">
        No sales recorded yet today.
      </p>
    );
  }

  return (
    <ul className="divide-line">
      {rows.map((sale) => {
        const PaymentIcon = paymentIcons[sale.payment];
        return (
          <li key={sale.id} className="flex items-center gap-3 px-5 py-3.5">
            <span className="hidden w-11 shrink-0 font-mono text-[11.5px] text-ink-faint tabular-nums sm:block">
              {sale.time}
            </span>

            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas font-mono text-[11px] font-semibold text-navy-800">
              {sale.sizeKg}kg
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-ink">
                {sale.customer}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-ink-faint">
                <span className="sm:hidden">{sale.time} · </span>
                <span>
                  {sale.type} · {sale.quantity} × {formatCylinder(sale.sizeKg)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <PaymentIcon className="h-3.5 w-3.5" />
                  {sale.payment}
                </span>
                <span aria-hidden="true">·</span>
                <span>{sale.staff}</span>
              </span>
            </span>

            <span className="shrink-0 text-right">
              <span className="block font-mono text-[13.5px] font-semibold text-ink tabular-nums">
                {formatKsh(saleValueKsh(sale))}
              </span>
              <Pill tone={sale.type === "Delivery" ? "info" : "neutral"} className="mt-1">
                {sale.id}
              </Pill>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
