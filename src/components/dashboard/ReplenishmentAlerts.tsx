import type { CylinderStock } from "@/lib/types";
import { stockStatus } from "@/lib/metrics";
import { formatCylinder } from "@/lib/format";
import { AlertIcon, CheckIcon } from "@/components/icons";

interface ReplenishmentAlertsProps {
  items: CylinderStock[];
}

export function ReplenishmentAlerts({ items }: ReplenishmentAlertsProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-good-soft/70 p-4">
        <CheckIcon className="mt-0.5 h-[18px] w-[18px] text-good" />
        <div>
          <p className="text-[13.5px] font-medium text-good">
            Every cylinder size is above its reorder level.
          </p>
          <p className="mt-0.5 text-[12.5px] text-good/80">
            Nothing to request from the depot today.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const critical = stockStatus(item) === "critical";
        const short = item.reorderLevel - item.onHand;
        return (
          <li
            key={item.sizeKg}
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              critical
                ? "border-bad/25 bg-bad-soft/60"
                : "border-warn/25 bg-warn-soft/50"
            }`}
          >
            <AlertIcon
              className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${
                critical ? "text-bad" : "text-warn"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-ink">
                {formatCylinder(item.sizeKg)} cylinders are{" "}
                {critical ? "critically low" : "running low"}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">
                <span className="font-mono tabular-nums">{item.onHand}</span> on hand
                against a reorder level of{" "}
                <span className="font-mono tabular-nums">{item.reorderLevel}</span>.
                {short > 0
                  ? ` Request ${short} more to return to the target level.`
                  : " Order the next depot drop to stay covered."}
              </p>
            </div>
            <button
              type="button"
              disabled
              title="Replenishment requests arrive with the Stock screen in the next build"
              className="mt-0.5 shrink-0 cursor-not-allowed rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink-faint"
            >
              Request
            </button>
          </li>
        );
      })}
    </ul>
  );
}
