import { stockStatus as sharedStockStatus } from "./status";
import type { CylinderStock, SaleRecord, StockStatus } from "./types";

/**
 * Value of a single sale line, in Kenya Shillings.
 *
 * The line total comes from the database (quantity x price - discount). The
 * multiplication is only a fallback for records built before that field
 * existed; a dashboard that recomputes revenue from list prices silently
 * ignores every discount.
 */
export function saleValueKsh(sale: SaleRecord): number {
  return sale.lineTotalKsh ?? sale.quantity * sale.unitPriceKsh;
}

/** Total takings for a list of sales. */
export function revenueKsh(sales: SaleRecord[]): number {
  return sales.reduce((sum, sale) => sum + saleValueKsh(sale), 0);
}

/** Number of cylinders handed over, across all sizes. Accessories do not count. */
export function cylindersSold(sales: SaleRecord[]): number {
  return sales.reduce((sum, sale) => (sale.isCylinder ? sum + sale.quantity : sum), 0);
}

/** Kilograms of gas actually sold. Only weighed cylinder lines contribute. */
export function gasKgSold(sales: SaleRecord[]): number {
  return sales.reduce(
    (sum, sale) => (sale.isCylinder && sale.sizeKg ? sum + sale.quantity * sale.sizeKg : sum),
    0,
  );
}

/** Receipts, not lines: a three-line sale is one sale. */
export function salesCount(sales: SaleRecord[]): number {
  return new Set(sales.map((sale) => sale.id)).size;
}

/** Average takings per receipt. A receipt may hold several lines. */
export function averageBasketKsh(sales: SaleRecord[]): number {
  const receipts = salesCount(sales);
  if (receipts === 0) return 0;
  return revenueKsh(sales) / receipts;
}

/**
 * Cylinder size with the most units sold. Returns null when there are no
 * sales yet — the dashboard must not assume a trading day has happened.
 */
export function bestSellingSizeKg(
  sales: SaleRecord[],
): { sizeKg: number; units: number } | null {
  const counts = new Map<number, number>();
  for (const sale of sales) {
    if (!sale.isCylinder || !sale.sizeKg) continue;
    counts.set(sale.sizeKg, (counts.get(sale.sizeKg) ?? 0) + sale.quantity);
  }
  let best: { sizeKg: number; units: number } | null = null;
  for (const [sizeKg, units] of counts) {
    if (best === null || units > best.units) best = { sizeKg, units };
  }
  return best;
}

/**
 * Share of this size's cylinders that are filled, as a 0-100 percentage.
 *
 * This used to divide by a fabricated "capacity" (at least 50, invented on
 * the page), which meant the bar had no relationship to reality. Filled vs
 * total cylinders is a number the branch can act on: it says how much of the
 * fleet is ready to sell.
 */
export function filledSharePercent(item: CylinderStock): number {
  const total = item.onHand + item.empties;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((item.onHand / total) * 100));
}

/**
 * Replenishment status for a stock row.
 *
 * This used to be a second copy of the rule with its own thresholds; it now
 * delegates to `lib/status`, which is the only place the rule lives.
 */
export function stockStatus(item: CylinderStock): StockStatus {
  return sharedStockStatus(item.onHand, item.reorderLevel);
}

/** Sizes that need a replenishment request, worst first. */
export function needsReplenishment(items: CylinderStock[]): CylinderStock[] {
  return items
    .filter((item) => stockStatus(item) !== "ok")
    .sort((a, b) => a.onHand / a.reorderLevel - b.onHand / b.reorderLevel);
}

/** Filled cylinders on site across every size. */
export function totalCylindersOnHand(items: CylinderStock[]): number {
  return items.reduce((sum, item) => sum + item.onHand, 0);
}

/** Kilograms of gas sitting in filled cylinders. */
export function gasKgOnHand(items: CylinderStock[]): number {
  return items.reduce((sum, item) => sum + item.onHand * item.sizeKg, 0);
}

/** What the filled stock is worth at current retail refill prices. */
export function stockValueKsh(items: CylinderStock[]): number {
  return items.reduce(
    (sum, item) => sum + item.onHand * item.refillPriceKsh,
    0,
  );
}
