import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SalesMix } from "@/components/dashboard/SalesMix";
import { SalesTrendChart } from "@/components/dashboard/SalesTrendChart";
import { StockTable } from "@/components/dashboard/StockTable";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { Card, KpiCard, StatusBadge } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import type { CylinderSizeKg, CylinderStock, DailyTotals, PaymentMethod, SaleRecord, SaleType } from "@/lib/types";
import {
  formatCylinder,
  formatCylinders,
  formatKsh,
  formatKg,
  formatLongDate,
} from "@/lib/format";
import * as metrics from "@/lib/metrics";

export const metadata: Metadata = {
  title: "Dashboard",
};
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const reportDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(date);
  const todayReport = `/reports?from=${reportDate(now)}&to=${reportDate(now)}`;
  const weekReport = `/reports?from=${reportDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000))}&to=${reportDate(now)}`;

  const { products, stock: stockService } = await getCustomerContext();

  let stock: CylinderStock[] = [];
  let salesToday: SaleRecord[] = [];
  let weekTotals: DailyTotals[] = [];

  if (products && stockService) {
    try {
      const [stockRows, salesRows, weekRows] = await Promise.all([
        stockService.stockRows(),
        products.db.query<Record<string, unknown>>(
          `select s.id, to_char(s.sale_date at time zone 'Africa/Nairobi', 'HH24:MI') as time,
                  coalesce(c.name, 'Walk-in') as customer,
                  coalesce(pv.size_kg, 13) as size_kg,
                  l.quantity,
                  l.unit_price as unit_price_ksh,
                  coalesce(sp.method, 'cash') as payment,
                  s.sale_type,
                  coalesce(u.full_name, 'Staff') as staff
             from sales s
             join sale_lines l on l.sale_id = s.id
             join product_variants pv on pv.id = l.variant_id
             left join customers c on c.id = s.customer_id
             left join app_users u on u.id = s.created_by
             left join lateral (
               select method from sale_payments where sale_id = s.id order by created_at limit 1
             ) sp on true
            where s.status = 'posted'
              and (s.sale_date at time zone 'Africa/Nairobi')::date = current_date
            order by s.sale_date desc`,
        ),
        products.db.query<Record<string, unknown>>(
          `select to_char(d.day, 'Dy') as label,
                  coalesce(sum(l.quantity), 0) as cylinders,
                  coalesce(sum(s.total), 0) as revenue_ksh
             from generate_series(current_date - interval '6 days', current_date - interval '1 day', interval '1 day') as d(day)
             left join sales s on (s.sale_date at time zone 'Africa/Nairobi')::date = d.day::date and s.status = 'posted'
             left join sale_lines l on l.sale_id = s.id
            group by d.day
            order by d.day`,
        ),
      ]);

      const stockBySize = new Map<CylinderSizeKg, { onHand: number; empties: number; refillPriceKsh: number }>();
      for (const row of stockRows) {
        if (!row.sizeKg) continue;
        const size = Number(row.sizeKg) as CylinderSizeKg;
        const current = stockBySize.get(size) ?? { onHand: 0, empties: 0, refillPriceKsh: row.listPriceKsh ?? 0 };
        current.onHand += Number(row.refills);
        current.empties += Number(row.empties);
        if (row.listPriceKsh && !current.refillPriceKsh) current.refillPriceKsh = Number(row.listPriceKsh);
        stockBySize.set(size, current);
      }
      stock = Array.from(stockBySize.entries()).map(([sizeKg, data]) => ({
        sizeKg,
        onHand: data.onHand,
        empties: data.empties,
        capacity: Math.max(data.onHand + data.empties, 50),
        reorderLevel: 10,
        refillPriceKsh: data.refillPriceKsh,
      }));

      const paymentMap: Record<string, PaymentMethod> = {
        mpesa: "M-Pesa",
        cash: "Cash",
        card: "Card",
        bank: "Bank Transfer",
      };
      const typeMap: Record<string, SaleType> = {
        refill: "Refill",
        new_cylinder: "New Cylinder",
        delivery: "Delivery",
      };

      salesToday = salesRows.map((r) => ({
        id: String(r.id),
        time: String(r.time ?? ""),
        customer: String(r.customer ?? "Walk-in"),
        sizeKg: (Number(r.size_kg) || 13) as CylinderSizeKg,
        quantity: Number(r.quantity ?? 0),
        unitPriceKsh: Number(r.unit_price_ksh ?? 0),
        payment: paymentMap[String(r.payment)] ?? "Cash",
        type: typeMap[String(r.sale_type)] ?? (String(r.sale_type) === "delivery" ? "Delivery" : "Refill"),
        staff: String(r.staff ?? "Staff"),
      }));

      weekTotals = weekRows.map((r) => ({
        label: String(r.label),
        cylinders: Number(r.cylinders ?? 0),
        revenueKsh: Number(r.revenue_ksh ?? 0),
      }));
    } catch {
      // Fall back to empty metrics if connection drops
    }
  }

  const takingsToday = metrics.revenueKsh(salesToday);
  const cylindersToday = metrics.cylindersSold(salesToday);
  const gasSoldToday = metrics.gasKgSold(salesToday);
  const averageBasket = metrics.averageBasketKsh(salesToday);
  const bestSeller = metrics.bestSellingSizeKg(salesToday);

  const kgOnHand = metrics.gasKgOnHand(stock);
  const cylindersOnHand = metrics.totalCylindersOnHand(stock);
  const alerts = metrics.needsReplenishment(stock);

  // Today's bar is computed from the same records as the KPI row.
  const trend = [
    ...weekTotals,
    { label: "Today", cylinders: cylindersToday, revenueKsh: takingsToday },
  ];

  return (
    <AppShell
      title="Dashboard"
      subtitle={`${formatLongDate(now)} · ${stationName}`}
      staff={currentStaff}
      branch={stationName}
      activeHref="/"
    >
      {/* Three metrics that change a decision. The old fourth card was a link
          to the alerts list, which is now a chip on the stock card. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a href={todayReport} aria-label="Open today’s sales report">
          <KpiCard
            label="Takings today"
            value={formatKsh(takingsToday)}
            subtext={`${cylindersToday} cylinders · ${salesToday.length} sales · avg ${formatKsh(averageBasket)}`}
          />
        </a>
        <a href={todayReport} aria-label="Open today’s sales report">
          <KpiCard
            label="Cylinders sold"
            value={String(cylindersToday)}
            subtext={`${formatKg(gasSoldToday)} of gas`}
          />
        </a>
        <KpiCard
          label="Stock on hand"
          value={`${formatKg(kgOnHand)} · ${formatCylinders(cylindersOnHand)}`}
          subtext="filled, across every size"
          chip={
            <a href="#stock" className="block">
              <StatusBadge tone={alerts.length === 0 ? "ok" : "warn"}>
                {alerts.length === 0
                  ? "All above reorder"
                  : `${alerts.length} need reorder`}
              </StatusBadge>
            </a>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <a href={weekReport} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" aria-label="Open seven-day sales report">
            <Card title="Takings, last 7 days" subtitle="Today counted so far">
              <SalesTrendChart data={trend} />
            </Card>
          </a>

          {/* One table replaces the old "Stock levels" and "Replenishment
              needed" panels, which showed the same numbers twice. */}
          <Card
            title="Stock"
            subtitle="Sorted worst first"
            flush
            className="scroll-mt-20"
            // The KPI chip links here.
          >
            <div id="stock">
              <StockTable items={stock} />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <a href={todayReport} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" aria-label="Open today’s sales report">
            <Card
              title="Today's sales"
              subtitle={
                bestSeller
                  ? `${formatCylinder(bestSeller.sizeKg)} is the best seller (${bestSeller.units})`
                  : "No sales yet"
              }
              flush
            >
              <RecentSales sales={salesToday} limit={6} />
            </Card>
          </a>

          <a href={todayReport} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" aria-label="Open today’s sales report">
            <Card title="Sales mix">
              <SalesMix sales={salesToday} />
            </Card>
          </a>
        </div>
      </div>

      <footer className="border-t border-border pt-3 text-xs text-ink-subtle">
        Gateway Gas Enterprises · internal staff portal.
      </footer>
    </AppShell>
  );
}
