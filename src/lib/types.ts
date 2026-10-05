/**
 * Domain types for Gateway Gas Enterprises stock & sales tracking.
 *
 * These describe the shape the real database will return. Until the datastore
 * is wired up, `src/lib/data.ts` supplies sample records with the same shape.
 */

export type CylinderSizeKg = 3 | 6 | 13 | 35 | 50;

export type PaymentMethod = "M-Pesa" | "Cash" | "Card" | "Bank Transfer";

export type SaleType = "Refill" | "New Cylinder" | "Delivery";

export interface CylinderStock {
  /** Nominal fill weight of the cylinder, in kilograms. */
  sizeKg: CylinderSizeKg;
  /** Cylinders currently filled and ready to sell. */
  onHand: number;
  /** Empties held at the station awaiting refill. */
  empties: number;
  /** How many of this size the station can hold when full. */
  capacity: number;
  /** Stock level at which staff must raise a replenishment request. */
  reorderLevel: number;
  /** Retail refill price in Kenya Shillings. */
  refillPriceKsh: number;
}

export interface SaleRecord {
  id: string;
  /** Local time of the sale, 24-hour clock. */
  time: string;
  /** Counter or customer reference. */
  customer: string;
  sizeKg: CylinderSizeKg;
  quantity: number;
  /** Unit price actually charged, in Kenya Shillings. */
  unitPriceKsh: number;
  payment: PaymentMethod;
  type: SaleType;
  /** Staff member who recorded the sale. */
  staff: string;
}

export interface DailyTotals {
  /** Short weekday label, e.g. "Tue". */
  label: string;
  cylinders: number;
  revenueKsh: number;
}

export type StockStatus = "critical" | "low" | "ok";

export interface StaffMember {
  name: string;
  initials: string;
  role: string;
}
