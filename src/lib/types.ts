/**
 * Domain types for Gateway Gas Enterprises stock & sales tracking.
 *
 * These describe the shape the real database will return. Until the datastore
 * is wired up, `src/lib/data.ts` supplies sample records with the same shape.
 */

/** Cylinder sizes are whatever the catalogue sells: 3, 6, 13, 22.5, 45, 50 kg. */
export type CylinderSizeKg = number;

export type PaymentMethod = "M-Pesa" | "Cash" | "Card" | "Bank Transfer" | "Credit";

/** The catalogue decides the line type; only LPG has a sale-mode choice. */
export type SaleLineType = "refill" | "new_cylinder" | "accessory" | "water" | "other";

export type SaleType = "Refill" | "New Cylinder" | "Delivery";

export interface CylinderStock {
  /** Nominal fill weight of the cylinder, in kilograms. */
  sizeKg: CylinderSizeKg;
  /** Cylinders currently filled and ready to sell. */
  onHand: number;
  /** Empties held at the station awaiting refill. */
  empties: number;
  /** Stock level at which staff must raise a replenishment request. */
  reorderLevel: number;
  /** Retail refill price in Kenya Shillings. */
  refillPriceKsh: number;
}

export interface SaleRecord {
  /** The receipt this line belongs to. Several lines share one id. */
  id: string;
  /** The line's own id, so a multi-line sale can be listed without duplicate keys. */
  lineId: string;
  /** Local time of the sale, 24-hour clock. */
  time: string;
  /** Counter or customer reference. */
  customer: string;
  /** Null for water, accessories and fittings — they are not weighed. */
  sizeKg: CylinderSizeKg | null;
  /** True only for LPG cylinder lines, which is what the cylinder KPIs count. */
  isCylinder: boolean;
  lineType: SaleLineType;
  quantity: number;
  /** Unit price actually charged, in Kenya Shillings. */
  unitPriceKsh: number;
  /** What the line actually took after any discount. */
  lineTotalKsh: number;
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
