import type {
  CylinderStock,
  DailyTotals,
  SaleRecord,
  StaffMember,
} from "./types";

/**
 * SAMPLE DATA — replace with database queries.
 *
 * Every number below is illustrative. Prices follow the retail LPG refill
 * ranges common in Nairobi (roughly KSh 110-120 per kg) and are meant to be
 * edited by station management from the settings page.
 */

export const stock: CylinderStock[] = [
  { sizeKg: 3, onHand: 42, empties: 18, capacity: 80, reorderLevel: 20, refillPriceKsh: 550 },
  { sizeKg: 6, onHand: 14, empties: 36, capacity: 120, reorderLevel: 25, refillPriceKsh: 1050 },
  { sizeKg: 13, onHand: 23, empties: 21, capacity: 70, reorderLevel: 20, refillPriceKsh: 2350 },
  { sizeKg: 35, onHand: 6, empties: 2, capacity: 16, reorderLevel: 4, refillPriceKsh: 5950 },
  { sizeKg: 50, onHand: 3, empties: 3, capacity: 14, reorderLevel: 6, refillPriceKsh: 8450 },
];

export const salesToday: SaleRecord[] = [
  {
    id: "TXN-4821",
    time: "16:42",
    customer: "Walk-in — Syokimau Rd",
    sizeKg: 6,
    quantity: 1,
    unitPriceKsh: 1050,
    payment: "M-Pesa",
    type: "Refill",
    staff: "Joyce W.",
  },
  {
    id: "TXN-4820",
    time: "15:55",
    customer: "Mama Mboga — Stall 14",
    sizeKg: 13,
    quantity: 1,
    unitPriceKsh: 2350,
    payment: "Cash",
    type: "Refill",
    staff: "Joyce W.",
  },
  {
    id: "TXN-4819",
    time: "15:10",
    customer: "Kirimi Hotels Ltd",
    sizeKg: 50,
    quantity: 2,
    unitPriceKsh: 8450,
    payment: "Bank Transfer",
    type: "Delivery",
    staff: "Brian O.",
  },
  {
    id: "TXN-4818",
    time: "14:26",
    customer: "Walk-in — Mlolongo",
    sizeKg: 3,
    quantity: 2,
    unitPriceKsh: 550,
    payment: "M-Pesa",
    type: "Refill",
    staff: "Amina S.",
  },
  {
    id: "TXN-4817",
    time: "13:38",
    customer: "New customer — Kitengela",
    sizeKg: 6,
    quantity: 1,
    unitPriceKsh: 3400,
    payment: "M-Pesa",
    type: "New Cylinder",
    staff: "Amina S.",
  },
  {
    id: "TXN-4816",
    time: "12:52",
    customer: "Walk-in — Syokimau Rd",
    sizeKg: 6,
    quantity: 1,
    unitPriceKsh: 1050,
    payment: "Card",
    type: "Refill",
    staff: "Joyce W.",
  },
  {
    id: "TXN-4815",
    time: "11:44",
    customer: "Kathomi Guest House",
    sizeKg: 35,
    quantity: 1,
    unitPriceKsh: 5950,
    payment: "M-Pesa",
    type: "Delivery",
    staff: "Brian O.",
  },
  {
    id: "TXN-4814",
    time: "10:19",
    customer: "Walk-in — Mavoko",
    sizeKg: 13,
    quantity: 1,
    unitPriceKsh: 2350,
    payment: "M-Pesa",
    type: "Refill",
    staff: "Amina S.",
  },
  {
    id: "TXN-4813",
    time: "09:26",
    customer: "Walk-in — Syokimau Rd",
    sizeKg: 3,
    quantity: 1,
    unitPriceKsh: 550,
    payment: "Cash",
    type: "Refill",
    staff: "Joyce W.",
  },
  {
    id: "TXN-4812",
    time: "08:05",
    customer: "Walk-in — Athi River",
    sizeKg: 6,
    quantity: 2,
    unitPriceKsh: 1050,
    payment: "M-Pesa",
    type: "Refill",
    staff: "Brian O.",
  },
];

/**
 * Completed trading days, oldest first. Today is intentionally absent: the
 * dashboard appends the totals it computed from `salesToday` so the chart and
 * the KPI row can never drift apart.
 */
export const weekTotals: DailyTotals[] = [
  { label: "Tue", cylinders: 31, revenueKsh: 44150 },
  { label: "Wed", cylinders: 27, revenueKsh: 38900 },
  { label: "Thu", cylinders: 36, revenueKsh: 52300 },
  { label: "Fri", cylinders: 44, revenueKsh: 63750 },
  { label: "Sat", cylinders: 58, revenueKsh: 84600 },
  { label: "Sun", cylinders: 39, revenueKsh: 55450 },
];

export const currentStaff: StaffMember = {
  name: "Joyce Wanjiru",
  initials: "JW",
  role: "Station Attendant",
};

export const stationName = "Gateway Gas Enterprises — Syokimau Branch";
