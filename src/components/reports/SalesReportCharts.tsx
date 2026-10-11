import { Card } from "@/components/ui";
import { formatKsh } from "@/lib/format";

type DailyPoint = { label: string; revenue: number; sales: number };
type Segment = { label: string; value: number; detail: string };

function height(value: number, maximum: number): string {
  if (value === 0 || maximum === 0) return "2px";
  return `${Math.max(6, Math.round((value / maximum) * 148))}px`;
}

function BarList({ title, subtitle, segments }: { title: string; subtitle: string; segments: Segment[] }) {
  const maximum = Math.max(...segments.map((segment) => segment.value), 1);
  return <Card title={title} subtitle={subtitle}>
    {segments.length === 0 ? <p className="text-sm text-ink-subtle">No posted sales match these filters.</p> : <ul className="space-y-3">{segments.map((segment) => <li key={segment.label}><div className="mb-1 flex items-baseline justify-between gap-3"><span className="truncate text-sm text-ink">{segment.label}</span><span className="num shrink-0 text-sm font-medium text-ink">{segment.detail}</span></div><div className="h-2 overflow-hidden rounded-pill bg-surface-muted"><div className="h-full rounded-pill bg-orange-500" style={{ width: `${(segment.value / maximum) * 100}%` }} /></div></li>)}</ul>}
  </Card>;
}

/** Server-rendered charts: they require no client chart library and always show
 * exactly the report's active filters rather than a separate dashboard range. */
export function SalesReportCharts({ daily, paymentReceipts, saleTypes }: { daily: DailyPoint[]; paymentReceipts: Segment[]; saleTypes: Segment[] }) {
  const maximum = Math.max(...daily.map((point) => point.revenue), 1);
  return <div className="grid gap-4 lg:grid-cols-3">
    <Card title="Sales trend" subtitle="Posted revenue by day in the selected period" className="lg:col-span-2">
      {daily.length === 0 ? <p className="text-sm text-ink-subtle">No posted sales match these filters.</p> : <div className="flex h-[196px] items-end gap-2 overflow-x-auto pt-4">{daily.map((point) => <div key={point.label} className="flex h-full min-w-10 flex-1 flex-col justify-end text-center"><span className="num mb-1 text-xs text-ink-muted">{formatKsh(point.revenue)}</span><div className="mx-auto w-full max-w-10 rounded-t-sm bg-orange-500" title={`${point.label}: ${formatKsh(point.revenue)} from ${point.sales} sale${point.sales === 1 ? "" : "s"}`} style={{ height: height(point.revenue, maximum) }} /><span className="mt-1 truncate text-xs text-ink-subtle">{point.label}</span></div>)}</div>}
      </Card>
    <BarList title="Payment mix" subtitle="Posted receipts by payment method" segments={paymentReceipts} />
    <div className="lg:col-span-3"><BarList title="Sales channel" subtitle="Revenue from counter and delivery sales" segments={saleTypes} /></div>
  </div>;
}
