import type { Metadata } from "next";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Panel } from "@/components/dashboard/Panel";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { ReplenishmentAlerts } from "@/components/dashboard/ReplenishmentAlerts";
import { SalesMix } from "@/components/dashboard/SalesMix";
import { SalesTrendChart } from "@/components/dashboard/SalesTrendChart";
import { StockTable } from "@/components/dashboard/StockTable";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { AlertIcon, CashIcon, CylinderIcon, ReceiptIcon } from "@/components/icons";
import {
  currentStaff,
  salesToday,
  stationName,
  stock,
  weekTotals,
} from "@/lib/data";
import {
  formatCylinder,
  formatCylinders,
  formatKsh,
  formatKg,
  formatLongDate,
  percentChange,
} from "@/lib/format";
import * as metrics from "@/lib/metrics";

export const metadata: Metadata = {
  title: "Operations dashboard",
};

export default function DashboardPage() {
  const now = new Date();

  const takingsToday = metrics.revenueKsh(salesToday);
  const cylindersToday = metrics.cylindersSold(salesToday);
  const gasSoldToday = metrics.gasKgSold(salesToday);
  const averageBasket = metrics.averageBasketKsh(salesToday);
  const bestSeller = metrics.bestSellingSizeKg(salesToday);

  const yesterday = weekTotals[weekTotals.length - 1];
  const takingsChange = percentChange(takingsToday, yesterday.revenueKsh);
  const cylinderChange = percentChange(cylindersToday, yesterday.cylinders);

  // Today's bar is computed from the same records as the KPI row.
  const trend = [
    ...weekTotals,
    { label: "Today", cylinders: cylindersToday, revenueKsh: takingsToday },
  ];

  const kgOnHand = metrics.gasKgOnHand(stock);
  const cylindersOnHand = metrics.totalCylindersOnHand(stock);
  const stockValue = metrics.stockValueKsh(stock);
  const alerts = metrics.needsReplenishment(stock);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar staff={currentStaff} station={stationName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title="Operations dashboard"
          subtitle={`${formatLongDate(now)} · ${stationName}`}
          staff={currentStaff}
        />

        <main className="flex-1 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          {/* Headline numbers */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Cylinders sold today"
              value={String(cylindersToday)}
              deltaPercent={cylinderChange}
              deltaCaption={`vs ${yesterday.cylinders} on ${yesterday.label} (full day)`}
              caption={`${salesToday.length} transactions`}
              icon={CylinderIcon}
              accent="navy"
            />
            <KpiCard
              label="Takings today"
              value={formatKsh(takingsToday)}
              deltaPercent={takingsChange}
              deltaCaption={`vs ${formatKsh(yesterday.revenueKsh)} on ${yesterday.label} (full day)`}
              caption={`avg ${formatKsh(averageBasket)} per sale`}
              icon={CashIcon}
              accent="flame"
            />
            <KpiCard
              label="Gas on hand"
              value={formatKg(kgOnHand)}
              caption={`${formatCylinders(cylindersOnHand)} · worth ${formatKsh(stockValue)}`}
              icon={ReceiptIcon}
              accent="info"
            />
            <KpiCard
              label="Reorder alerts"
              value={String(alerts.length)}
              caption={
                alerts.length === 0
                  ? "all sizes above reorder level"
                  : alerts.map((item) => formatCylinder(item.sizeKg)).join(", ") +
                    " need replenishment"
              }
              icon={AlertIcon}
              accent={alerts.length === 0 ? "good" : "flame"}
            />
          </div>

          {/* Takings trend + replenishment */}
          <div className="grid gap-5 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="Takings, last 7 days"
              subtitle="Refills, new cylinders and deliveries · today counted so far"
              action={
                <span className="rounded-lg border border-flame-500/30 bg-flame-500/10 px-2.5 py-1 font-mono text-[12px] font-semibold text-flame-700 tabular-nums">
                  Today {formatKsh(takingsToday)}
                </span>
              }
            >
              <SalesTrendChart data={trend} />
            </Panel>

            <Panel
              title="Replenishment needed"
              subtitle="Sizes at or below their reorder level"
              action={
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[11.5px] font-medium text-ink-soft">
                  {alerts.length} item{alerts.length === 1 ? "" : "s"}
                </span>
              }
            >
              <ReplenishmentAlerts items={alerts} />
            </Panel>
          </div>

          {/* Stock + today's sales */}
          <div className="grid gap-5 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="Stock levels"
              subtitle={`Filled cylinders at ${stationName.split("—")[1]?.trim() ?? "the station"}`}
              bodyClassName=""
              action={
                <button
                  type="button"
                  disabled
                  title="Stock management arrives in the next build"
                  className="cursor-not-allowed rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-faint"
                >
                  Manage stock
                </button>
              }
            >
              <StockTable items={stock} />
            </Panel>

            <Panel
              title="Today's sales"
              subtitle={`${formatCylinders(cylindersToday)} · ${formatKg(gasSoldToday)} of gas`}
              bodyClassName=""
            >
              <div className="max-h-[420px] overflow-y-auto">
                <RecentSales sales={salesToday} limit={6} />
              </div>
            </Panel>
          </div>

          {/* Quick actions + sales mix */}
          <div className="grid gap-5 xl:grid-cols-3">
            <Panel title="Quick actions" subtitle="Everyday staff tasks">
              <QuickActions />
            </Panel>

            <Panel
              className="xl:col-span-2"
              title="Sales mix"
              subtitle={
                bestSeller
                  ? `${formatCylinder(bestSeller.sizeKg)} cylinders are today's best seller (${bestSeller.units} sold)`
                  : "No sales recorded yet today"
              }
            >
              <SalesMix sales={salesToday} />
            </Panel>
          </div>

          <footer className="border-t border-line pt-4 pb-2 text-[11.5px] text-ink-faint">
            <p>
              Gateway Gas Enterprises · internal staff portal. Figures shown are
              sample data until the stock database is connected.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
