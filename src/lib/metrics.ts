import type { CylinderStock, SaleRecord, StockStatus } from "./types";

/** Value of a single sale line, in Kenya Shillings. */
export function saleValueKsh(sale: SaleRecord): number {
  return sale.quantity * sale.unitPriceKsh;
}

/** Total takings for a list of sales. */
export function revenueKsh(sales: SaleRecord[]): number {
  return sales.reduce((sum, sale) => sum + saleValueKsh(sale), 0);
}

/** Number of cylinders handed over, across all sizes. */
export function cylindersSold(sales: SaleRecord[]): number {
  return sales.reduce((sum, sale) => sum + sale.quantity, 0);
}

/** Kilograms of gas actually sold. */
export function gasKgSold(sales: SaleRecord[]): number {
  return sales.reduce((sum, sale) => sum + sale.quantity * sale.sizeKg, 0);
}

/** Average takings per transaction. */
export function averageBasketKsh(sales: SaleRecord[]): number {
  if (sales.length === 0) return 0;
  return revenueKsh(sales) / sales.length;
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
    counts.set(sale.sizeKg, (counts.get(sale.sizeKg) ?? 0) + sale.quantity);
  }
  let best: { sizeKg: number; units: number } | null = null;
  for (const [sizeKg, units] of counts) {
    if (best === null || units > best.units) best = { sizeKg, units };
  }
  return best;
}

/** How full a storage slot is, as a 0-100 percentage. */
export function fillPercent(item: CylinderStock): number {
  if (item.capacity <= 0) return 0;
  return Math.min(100, Math.round((item.onHand / item.capacity) * 100));
}

/**
 * Replenishment status. `critical` sits at or below half the reorder level so
 * the dashboard can distinguish "order today" from "order soon".
 */
export function stockStatus(item: CylinderStock): StockStatus {
  if (item.onHand <= item.reorderLevel / 2) return "critical";
  if (item.onHand <= item.reorderLevel) return "low";
  return "ok";
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
