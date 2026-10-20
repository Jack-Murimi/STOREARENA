import { describe, expect, it } from "vitest";
import {
  averageBasketKsh,
  bestSellingSizeKg,
  cylindersSold,
  filledSharePercent,
  gasKgSold,
  revenueKsh,
  salesCount,
} from "../metrics";
import type { CylinderStock, SaleRecord } from "../types";

const line = (patch: Partial<SaleRecord>): SaleRecord => ({
  id: "receipt-1",
  lineId: "line-1",
  time: "09:00",
  customer: "Walk-in",
  sizeKg: 13,
  isCylinder: true,
  lineType: "refill",
  quantity: 1,
  unitPriceKsh: 3000,
  lineTotalKsh: 3000,
  payment: "Cash",
  type: "Refill",
  staff: "Staff",
  ...patch,
});

const stock = (patch: Partial<CylinderStock>): CylinderStock => ({
  sizeKg: 13,
  onHand: 10,
  empties: 10,
  reorderLevel: 5,
  refillPriceKsh: 3000,
  ...patch,
});

describe("dashboard totals", () => {
  it("counts each receipt once, however many lines it has", () => {
    const sale = [
      line({ lineId: "a", lineTotalKsh: 6000, quantity: 2 }),
      line({ lineId: "b", lineTotalKsh: 3000 }),
      line({ lineId: "c", lineTotalKsh: 500, isCylinder: false, sizeKg: null, lineType: "accessory" }),
    ];
    expect(revenueKsh(sale)).toBe(9500);
    expect(salesCount(sale)).toBe(1);
    expect(averageBasketKsh(sale)).toBe(9500);
  });

  it("averages across distinct receipts, not lines", () => {
    const sale = [
      line({ id: "r1", lineId: "a", lineTotalKsh: 6000 }),
      line({ id: "r2", lineId: "b", lineTotalKsh: 3000 }),
      line({ id: "r3", lineId: "c", lineTotalKsh: 1000 }),
    ];
    expect(salesCount(sale)).toBe(3);
    expect(averageBasketKsh(sale)).toBe(10000 / 3);
  });

  it("never counts water or fittings as cylinders or as gas kilograms", () => {
    const sale = [
      line({ lineId: "a", quantity: 2, sizeKg: 13 }),
      line({
        lineId: "b",
        quantity: 4,
        sizeKg: null,
        isCylinder: false,
        lineType: "water",
        lineTotalKsh: 400,
      }),
    ];
    expect(cylindersSold(sale)).toBe(2);
    expect(gasKgSold(sale)).toBe(26);
  });

  it("falls back to quantity x price when a line total is missing", () => {
    const legacy = line({ lineTotalKsh: undefined as unknown as number, quantity: 2, unitPriceKsh: 2500 });
    expect(revenueKsh([legacy])).toBe(5000);
  });

  it("returns no best seller for an empty day", () => {
    expect(bestSellingSizeKg([])).toBeNull();
  });

  it("picks the size with the most units, ignoring other items", () => {
    const sale = [
      line({ lineId: "a", sizeKg: 13, quantity: 2 }),
      line({ lineId: "b", sizeKg: 6, quantity: 5 }),
      line({ lineId: "c", sizeKg: null, isCylinder: false, quantity: 40 }),
    ];
    expect(bestSellingSizeKg(sale)).toEqual({ sizeKg: 6, units: 5 });
  });
});

describe("filled share", () => {
  it("reports how much of the fleet is ready to sell", () => {
    expect(filledSharePercent(stock({ onHand: 30, empties: 10 }))).toBe(75);
  });

  it("is zero rather than a division by zero when nothing is held", () => {
    expect(filledSharePercent(stock({ onHand: 0, empties: 0 }))).toBe(0);
  });
});
