import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SalesMix } from "@/components/dashboard/SalesMix";
import { SalesTrendChart } from "@/components/dashboard/SalesTrendChart";
import { StockTable } from "@/components/dashboard/StockTable";
import { RecentSales } from "@/components/dashboard/RecentSales";
import { Card, KpiCard, StatusBadge } from "@/components/ui";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import type {
  CylinderStock,
  DailyTotals,
  PaymentMethod,
  SaleLineType,
  SaleRecord,
  SaleType,
} from "@/lib/types";
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

/**
 * Everything on this page is filtered against the *business day in Nairobi*,
 * not the database session's UTC date. Between 00:00 and 03:00 EAT those are
 * different days, and the old `current_date` comparison showed yesterday's
 * (empty) numbers for the first three hours of every trading day.
 */
const NAIROBI_TODAY = "(now() at time zone 'Africa/Nairobi')::date";

const paymentMap: Record<string, PaymentMethod> = {
  mpesa: "M-Pesa",
  cash: "Cash",
  card: "Card",
  bank: "Bank Transfer",
  credit: "Credit",
};

const typeMap: Record<string, SaleType> = {
  refill: "Refill",
  new_cylinder: "New Cylinder",
};

function saleType(row: Record<string, unknown>): SaleType {
  if (String(row.sale_type) === "delivery") return "Delivery";
  return typeMap[String(row.line_type)] ?? "Refill";
}

export default async function DashboardPage() {
  const now = new Date();
  const reportDate = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(date);
  const todayReport = `/reports?from=${reportDate(now)}&to=${reportDate(now)}`;
  const weekReport = `/reports?from=${reportDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000))}&to=${reportDate(now)}`;

  const { products, stock: stockService } = await getCustomerContext();

  let stock: CylinderStock[] = [];
  let salesToday: SaleRecord[] = [];
  let weekTotals: DailyTotals[] = [];
  let todayTakings = 0;
  let todayReceipts = 0;
  let loadError: string | null = null;

  if (products && stockService) {
    try {
      const [stockRows, salesRows, weekRows, todayRows] = await Promise.all([
        stockService.stockRows(),
        // One row per sale *line*, with the line's own totals. The category
        // decides whether a line is a cylinder - `coalesce(size_kg, 13)` used
        // to count water and regulators as 13 kg cylinders.
        products.db.query<Record<string, unknown>>(
          `select s.id as sale_id, l.id as line_id,
                  to_char(s.sale_date at time zone 'Africa/Nairobi', 'HH24:MI') as time,
                  coalesce(c.name, 'Walk-in') as customer,
                  pv.size_kg,
                  cat.stock_model,
                  l.line_type,
                  l.quantity,
                  l.unit_price,
                  (l.line_total - l.discount_amount) as line_total,
                  coalesce(sp.method, 'cash') as payment,
                  s.sale_type,
                  coalesce(u.full_name, 'Staff') as staff
             from sales s
             join sale_lines l on l.sale_id = s.id
             join product_variants pv on pv.id = l.variant_id
             join categories cat on cat.id = pv.category_id
             left join customers c on c.id = s.customer_id
             left join app_users u on u.id = coalesce(s.user_id, s.created_by)
             left join lateral (
               select method from sale_payments where sale_id = s.id order by created_at limit 1
             ) sp on true
            where s.status = 'posted'
              and (s.sale_date at time zone 'Africa/Nairobi')::date = ${NAIROBI_TODAY}
            order by s.sale_date desc, l.id`,
        ),
        // Takings per day, aggregated from `sales` alone. Joining sale_lines
        // here summed each receipt once per line, so a three-line sale
        // reported its total three times.
        products.db.query<Record<string, unknown>>(
          `select to_char(d.day, 'Dy') as label,
                  coalesce(rev.revenue, 0) as revenue_ksh,
                  coalesce(cyl.cylinders, 0) as cylinders
             from generate_series(
                    ${NAIROBI_TODAY} - 6,
                    ${NAIROBI_TODAY} - 1,
                    interval '1 day'
                  ) as d(day)
             left join (
               select (s.sale_date at time zone 'Africa/Nairobi')::date as day,
                      sum(s.total) as revenue
                 from sales s
                where s.status = 'posted'
                group by 1
             ) rev on rev.day = d.day::date
             left join (
               select (s.sale_date at time zone 'Africa/Nairobi')::date as day,
                      sum(l.quantity) as cylinders
                 from sales s
                 join sale_lines l on l.sale_id = s.id
                 join product_variants pv on pv.id = l.variant_id
                 join categories cat on cat.id = pv.category_id
                where s.status = 'posted' and cat.stock_model = 'CYLINDER'
                group by 1
             ) cyl on cyl.day = d.day::date
            order by d.day`,
        ),
        // Receipt-level takings for the headline card. Summing line totals
        // would be equivalent only while create_sale keeps `sales.total`
        // exactly equal to the sum of its lines; taking the receipt total is
        // the number the till and the receipt agree on.
        products.db.query<Record<string, unknown>>(
          `select count(*)::int as receipts, coalesce(sum(s.total), 0) as takings
             from sales s
            where s.status = 'posted'
              and (s.sale_date at time zone 'Africa/Nairobi')::date = ${NAIROBI_TODAY}`,
        ),
      ]);

      const stockBySize = new Map<
        number,
        { onHand: number; empties: number; refillPriceKsh: number; reorderLevel: number }
      >();
      for (const row of stockRows) {
        if (!row.sizeKg) continue;
        const size = Number(row.sizeKg);
        const current =
          stockBySize.get(size) ?? {
            onHand: 0,
            empties: 0,
            refillPriceKsh: row.sellingPrice ?? 0,
            reorderLevel: row.reorderLevel ?? 0,
          };
        current.onHand += Number(row.refills);
        current.empties += Number(row.empties);
        if (row.sellingPrice && !current.refillPriceKsh) {
          current.refillPriceKsh = Number(row.sellingPrice);
        }
        // The largest configured threshold wins, so a size is not reported
        // healthy just because one brand has a low reorder level.
        current.reorderLevel = Math.max(current.reorderLevel, Number(row.reorderLevel ?? 0));
        stockBySize.set(size, current);
      }
      stock = Array.from(stockBySize.entries())
        .map(([sizeKg, data]) => ({
          sizeKg,
          onHand: data.onHand,
          empties: data.empties,
          reorderLevel: data.reorderLevel,
          refillPriceKsh: data.refillPriceKsh,
        }))
        .sort((a, b) => a.sizeKg - b.sizeKg);

      salesToday = salesRows.map((r) => {
        // The category's stock model is what makes a line a cylinder; its
        // `code` is a display label and differs between seed files ("LPG" vs
        // "LPG-CYL").
        const isCylinder = String(r.stock_model ?? "") === "CYLINDER";
        return {
          id: String(r.sale_id),
          lineId: String(r.line_id),
          time: String(r.time ?? ""),
          customer: String(r.customer ?? "Walk-in"),
          sizeKg: r.size_kg === null || r.size_kg === undefined ? null : Number(r.size_kg),
          isCylinder,
          lineType: String(r.line_type ?? "other") as SaleLineType,
          quantity: Number(r.quantity ?? 0),
          unitPriceKsh: Number(r.unit_price ?? 0),
          lineTotalKsh: Number(r.line_total ?? 0),
          payment: paymentMap[String(r.payment)] ?? "Cash",
          type: saleType(r),
          staff: String(r.staff ?? "Staff"),
        } satisfies SaleRecord;
      });

      const todayRow = todayRows[0] ?? {};
      todayTakings = Number(todayRow.takings ?? 0);
      todayReceipts = Number(todayRow.receipts ?? 0);

      weekTotals = weekRows.map((r) => ({
        label: String(r.label),
        cylinders: Number(r.cylinders ?? 0),
        revenueKsh: Number(r.revenue_ksh ?? 0),
      }));
    } catch (error) {
      // A quiet day and a broken query used to look identical: both rendered
      // KSh 0. Say so instead of inventing a trading day.
      loadError = (error as Error).message.split("\n")[0];
    }
  }

  const takingsToday = todayTakings;
  const cylindersToday = metrics.cylindersSold(salesToday);
  const gasSoldToday = metrics.gasKgSold(salesToday);
  const receiptsToday = todayReceipts;
  const averageBasket = receiptsToday === 0 ? 0 : takingsToday / receiptsToday;
  // Both counts describe the same filter. If they disagree, the receipt query
  // and the line query are not looking at the same day - say so rather than
  // showing two different "today" figures side by side.
  const lineReceipts = metrics.salesCount(salesToday);
  if (receiptsToday !== lineReceipts) {
    loadError ??= `Today’s receipts disagree between queries (${receiptsToday} vs ${lineReceipts}).`;
  }
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
      {!products ? (
        <p className="rounded-lg border border-warn bg-warn-bg p-3 text-sm text-warn">
          No database connection — this dashboard is empty, not idle. Set DATABASE_URL and redeploy.
        </p>
      ) : null}
      {loadError ? (
        <p role="alert" className="rounded-lg border border-critical bg-critical-bg p-3 text-sm text-critical">
          Today’s figures could not be loaded: {loadError}
        </p>
      ) : null}

      {/* Three metrics that change a decision. The old fourth card was a link
          to the alerts list, which is now a chip on the stock card. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a href={todayReport} aria-label="Open today’s sales report">
          <KpiCard
            label="Takings today"
            value={formatKsh(takingsToday)}
            subtext={`${cylindersToday} cylinders · ${receiptsToday} sale${receiptsToday === 1 ? "" : "s"} · avg ${formatKsh(averageBasket)}`}
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
