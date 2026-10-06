import type { CylinderStock } from "@/lib/types";
import { fillPercent, stockStatus } from "@/lib/metrics";
import { STOCK_STATUS_META, stockStatus as statusOf } from "@/lib/status";
import { formatCylinder, formatKsh } from "@/lib/format";
import { DataTable, StatusBadge, Button } from "@/components/ui";
import type { DataColumn } from "@/components/ui";

/**
 * One stock table, sorted worst first.
 *
 * It replaces two panels that showed the same numbers — "Stock levels" and
 * "Replenishment needed" — and adds the request button inline, so acting on a
 * low row does not mean finding it again in another list.
 */
export function StockTable({ items }: { items: CylinderStock[] }) {
  const worstFirst = [...items].sort(
    (a, b) => a.onHand / a.reorderLevel - b.onHand / b.reorderLevel,
  );

  const columns: DataColumn<CylinderStock>[] = [
    {
      key: "cylinder",
      header: "Cylinder",
      priority: 1,
      cell: (item) => (
        <span className="font-medium text-ink">{formatCylinder(item.sizeKg)}</span>
      ),
    },
    { key: "onHand", header: "On hand", align: "right", num: true, priority: 2, cell: (i) => i.onHand },
    { key: "empties", header: "Empties", align: "right", num: true, cell: (i) => i.empties },
    {
      key: "level",
      header: "Level",
      cell: (item) => <LevelBar item={item} />,
    },
    {
      key: "status",
      header: "Status",
      priority: 3,
      cell: (item) => {
        const meta = STOCK_STATUS_META[statusOf(item.onHand, item.reorderLevel)];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      num: true,
      cell: (item) => formatKsh(item.refillPriceKsh),
    },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (item) =>
        stockStatus(item) === "ok" ? null : (
          <Button size="sm" variant="secondary" title="Request a refill from the depot">
            Request
          </Button>
        ),
    },
  ];

  return <DataTable columns={columns} rows={worstFirst} rowKey={(item) => String(item.sizeKg)} />;
}

/** Fill against capacity, with a marker where the reorder level sits. */
function LevelBar({ item }: { item: CylinderStock }) {
  const percent = fillPercent(item);
  const reorderPercent =
    item.capacity > 0 ? Math.min(100, (item.reorderLevel / item.capacity) * 100) : 0;
  const status = statusOf(item.onHand, item.reorderLevel);
  const fill =
    status === "critical" ? "bg-critical" : status === "low" ? "bg-warn" : "bg-ok";

  return (
    <div className="flex min-w-[96px] items-center gap-2">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-muted">
        <div className={`h-full rounded-pill ${fill}`} style={{ width: `${percent}%` }} />
        <span
          aria-hidden="true"
          title={`Reorder at ${item.reorderLevel}`}
          className="absolute top-0 h-full w-px bg-ink-subtle"
          style={{ left: `${reorderPercent}%` }}
        />
      </div>
      <span className="num w-8 text-right text-xs text-ink-subtle">{percent}%</span>
    </div>
  );
}
