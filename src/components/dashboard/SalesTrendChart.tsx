interface TrendPoint {
  label: string;
  cylinders: number;
  revenueKsh: number;
}

/** KSh 25,000 -> "25K". The only place an abbreviation is allowed. */
function axisLabel(value: number): string {
  if (value === 0) return "0";
  return `${Math.round(value / 1000)}K`;
}

/** Rounds the axis up to a readable step: 0, 25K, 50K, 75K, 100K. */
function niceCeiling(max: number): number {
  if (max <= 0) return 25_000;
  const step = 25_000;
  return Math.ceil(max / step) * step;
}

/**
 * Takings over the last seven days, about 200px tall.
 *
 * Past days are pale orange, today is solid orange and marked "in progress" —
 * a part-finished day next to six complete ones reads as a collapse unless it
 * says otherwise.
 */
export function SalesTrendChart({ data }: { data: TrendPoint[] }) {
  const height = 200;
  const plotHeight = height - 34; // room for the labels underneath
  const ceiling = niceCeiling(Math.max(...data.map((d) => d.revenueKsh), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ceiling * f);
  const todayIndex = data.length - 1;

  return (
    <div className="px-4 py-3">
      <div className="relative" style={{ height }}>
        {/* gridlines and y labels */}
        {ticks.map((tick) => {
          const y = plotHeight - (tick / ceiling) * plotHeight;
          return (
            <div key={tick} className="absolute inset-x-0" style={{ top: y }}>
              <div className="border-t border-border" />
              <span className="num absolute -top-2 right-0 translate-y-[-100%] text-xs text-ink-subtle">
                {axisLabel(tick)}
              </span>
            </div>
          );
        })}

        <div className="absolute inset-x-0 top-0 flex items-end gap-1.5 pr-8" style={{ height: plotHeight }}>
          {data.map((point, index) => {
            const isToday = index === todayIndex;
            const barHeight = ceiling === 0 ? 0 : (point.revenueKsh / ceiling) * plotHeight;
            return (
              <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="num text-xs text-ink-muted">
                  {axisLabel(point.revenueKsh)}
                </span>
                <div
                  title={`${point.label}: KSh ${point.revenueKsh.toLocaleString("en-KE")} · ${point.cylinders} cylinders`}
                  className={`w-full max-w-[42px] rounded-t-sm ${
                    isToday ? "bg-orange-500" : "bg-orange-200"
                  }`}
                  style={{ height: Math.max(barHeight, 2) }}
                />
              </div>
            );
          })}
        </div>

        {/* x labels: weekday with the date under it */}
        <div className="absolute inset-x-0 flex gap-1.5 pr-8" style={{ top: plotHeight + 6 }}>
          {data.map((point, index) => (
            <div key={point.label} className="min-w-0 flex-1 text-center">
              <span
                className={`block truncate text-xs ${
                  index === todayIndex ? "font-semibold text-orange-700" : "text-ink-muted"
                }`}
              >
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-subtle">
        <span className="inline-block h-2 w-2 rounded-sm bg-orange-500" aria-hidden="true" />
        Today, in progress — the day is not over, so it is not comparable to a full day.
      </p>
    </div>
  );
}
