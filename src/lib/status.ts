/**
 * The one rule that decides every status label in the app.
 *
 * Stock health used to be computed in three places with slightly different
 * thresholds, so the same cylinder could read "Low" on the dashboard and
 * "Healthy" in the stock table. There is now one function and it is used
 * everywhere.
 *
 *   Critical  at or below 50% of the reorder level
 *   Low       at or below the reorder level
 *   Healthy   otherwise
 */
export type StockStatus = "ok" | "low" | "critical";

export function stockStatus(onHand: number, reorderLevel: number): StockStatus {
  if (reorderLevel <= 0) return "ok";
  if (onHand <= reorderLevel / 2) return "critical";
  if (onHand <= reorderLevel) return "low";
  return "ok";
}

/**
 * Status is never colour alone: every badge carries a word and an icon.
 * These are the only three stock states the UI is allowed to render.
 */
export const STOCK_STATUS_META: Record<
  StockStatus,
  { label: string; tone: "ok" | "warn" | "critical"; icon: "check" | "alert" | "stop" }
> = {
  ok: { label: "Healthy", tone: "ok", icon: "check" },
  low: { label: "Low", tone: "warn", icon: "alert" },
  critical: { label: "Critical", tone: "critical", icon: "stop" },
};
