import type { CylinderStock } from "@/lib/types";
import { fillPercent, stockStatus } from "@/lib/metrics";
import { formatCylinder, formatKsh } from "@/lib/format";
import { Pill } from "./Panel";

interface StockTableProps {
  items: CylinderStock[];
}

const statusCopy = {
  ok: { label: "Healthy", tone: "good" as const },
  low: { label: "Reorder soon", tone: "warn" as const },
  critical: { label: "Critical", tone: "bad" as const },
};

const barColours = {
  ok: "bg-navy-700",
  low: "bg-flame-500",
  critical: "bg-red-600",
};

export function StockTable({ items }: StockTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
            <th scope="col" className="px-5 py-2.5 font-semibold">
              Cylinder
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">
              On hand
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">
              Empties
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Storage used
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Status
            </th>
            <th scope="col" className="px-5 py-2.5 text-right font-semibold">
              Refill price
            </th>
          </tr>
        </thead>
        <tbody className="divide-line">
          {items.map((item) => {
            const status = stockStatus(item);
            const copy = statusCopy[status];
            return (
              <tr key={item.sizeKg} className="transition-colors hover:bg-canvas/70">
                <th scope="row" className="px-5 py-3.5 font-normal">
                  <span className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-900/6 font-mono text-[11.5px] font-semibold text-navy-800">
                      {item.sizeKg}
                    </span>
                    <span className="text-[13.5px] font-medium text-ink">
                      {formatCylinder(item.sizeKg)} cylinder
                    </span>
                  </span>
                </th>
                <td className="px-3 py-3.5 text-right font-mono text-[13.5px] text-ink tabular-nums">
                  {item.onHand}
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-[13.5px] text-ink-soft tabular-nums">
                  {item.empties}
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line">
                      <div
                        className={`h-full rounded-full ${barColours[status]}`}
                        style={{ width: `${fillPercent(item)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11.5px] whitespace-nowrap text-ink-faint tabular-nums">
                      {item.onHand}/{item.capacity}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <Pill tone={copy.tone}>{copy.label}</Pill>
                </td>
                <td className="px-5 py-3.5 text-right font-mono text-[13.5px] text-ink tabular-nums">
                  {formatKsh(item.refillPriceKsh)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
