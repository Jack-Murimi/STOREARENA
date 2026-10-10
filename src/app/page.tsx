import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SalesMix } from "@/components/dashboard/SalesMix";
import { SalesTrendChart } from "@/components/dashboard/SalesTrendChart";
import { StockTable } from "@/components/dashboard/StockTable";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { Card, KpiCard, StatusBadge } from "@/components/ui";
import { currentStaff, salesToday, stationName, stock, weekTotals } from "@/lib/data";
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

export default function DashboardPage() {
  const now = new Date();

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
        <a href="/reports" aria-label="Open sales reports">
          <KpiCard
            label="Takings today"
            value={formatKsh(takingsToday)}
            subtext={`${cylindersToday} cylinders · ${salesToday.length} sales · avg ${formatKsh(averageBasket)}`}
          />
        </a>
        <a href="/reports" aria-label="Open sales reports">
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
          <a href="/reports" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" aria-label="Open sales reports">
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

          <a href="/reports" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" aria-label="Open sales reports">
            <Card title="Sales mix">
              <SalesMix sales={salesToday} />
            </Card>
          </a>
        </div>
      </div>

      <footer className="border-t border-border pt-3 text-xs text-ink-subtle">
        Gateway Gas Enterprises · internal staff portal. Figures are sample data
        until the stock database is connected.
      </footer>
    </AppShell>
  );
}
