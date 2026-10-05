import type { DailyTotals } from "@/lib/types";
import { formatKsh, formatKshCompact } from "@/lib/format";

interface SalesTrendChartProps {
  data: DailyTotals[];
}

const CHART_HEIGHT = 192;

/**
 * Seven-day takings chart. Rendered with CSS bars rather than an SVG path so
 * it stays crisp and responsive without a charting dependency.
 */
export function SalesTrendChart({ data }: SalesTrendChartProps) {
  const maxRevenue = Math.max(...data.map((day) => day.revenueKsh), 1);
  const axisValues = [1, 0.75, 0.5, 0.25, 0].map((step) => maxRevenue * step);

  return (
    <div>
      <div className="flex gap-3">
        {/* Value axis */}
        <div
          className="flex w-12 shrink-0 flex-col justify-between text-right font-mono text-[10.5px] text-ink-faint tabular-nums"
          style={{ height: CHART_HEIGHT }}
          aria-hidden="true"
        >
          {axisValues.map((value, index) => (
            <span key={index}>{formatKshCompact(value)}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Gridlines */}
          <div
            className="absolute inset-x-0 top-0 flex flex-col justify-between"
            style={{ height: CHART_HEIGHT }}
            aria-hidden="true"
          >
            {axisValues.map((_, index) => (
              <span
                key={index}
                className={`border-t ${
                  index === axisValues.length - 1
                    ? "border-line"
                    : "border-dashed border-line/80"
                }`}
              />
            ))}
          </div>

          {/* Bars */}
          <ul className="relative flex items-end gap-1.5 sm:gap-3" style={{ height: CHART_HEIGHT }}>
            {data.map((day, index) => {
              const isToday = index === data.length - 1;
              const heightPercent = Math.max(
                3,
                Math.round((day.revenueKsh / maxRevenue) * 100),
              );
              return (
                <li
                  key={day.label}
                  className="group flex h-full flex-1 items-end"
                  title={`${day.label} · ${day.cylinders} cylinders · ${formatKsh(day.revenueKsh)}`}
                >
                  <div
                    className={`relative w-full rounded-t-[5px] transition-[opacity] group-hover:opacity-85 ${
                      isToday
                        ? "bg-gradient-to-t from-flame-600 to-flame-400"
                        : "bg-gradient-to-t from-navy-800 to-navy-600"
                    }`}
                    style={{ height: `${heightPercent}%` }}
                  >
                    <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[10px] whitespace-nowrap text-ink opacity-0 transition-opacity group-hover:opacity-100">
                      {formatKshCompact(day.revenueKsh)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Category axis */}
      <div className="mt-2 flex gap-3 pl-15">
        {data.map((day, index) => (
          <span
            key={day.label}
            className={`flex-1 text-center text-[11.5px] ${
              index === data.length - 1
                ? "font-semibold text-flame-700"
                : "text-ink-soft"
            }`}
          >
            {day.label}
          </span>
        ))}
      </div>
    </div>
  );
}
