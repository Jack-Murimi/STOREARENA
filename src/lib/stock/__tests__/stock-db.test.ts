import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgliteDatabase } from "../../customers/pglite";
import { seedCatalogue } from "../catalogue-seed";
import { StockLedgerService, StockError } from "../stock-db";

const DDL = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

let db: PGlite;
let stock: StockLedgerService;
let afrigas13: string;
let nextgen: string;
let lavington: string;

async function id(sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await db.query<{ id: string }>(sql, params);
  return String(rows[0].id);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(DDL);
  const adapter = pgliteDatabase(db);
  await seedCatalogue(adapter);
  stock = new StockLedgerService(adapter);

  afrigas13 = await id("SELECT id FROM product_variants WHERE name = $1", ["Afrigas 13 kg"]);
  nextgen = await id("SELECT id FROM stock_locations WHERE name = 'Nextgen'");
  lavington = await id("SELECT id FROM stock_locations WHERE name = 'Lavington'");
});

afterEach(async () => {
  await db.close();
});

describe("receiving a delivery", () => {
  it("puts the cylinders on the branch and records what they cost", async () => {
    const result = await stock.recordPurchase({
      locationId: nextgen,
      variantId: afrigas13,
      quantity: 20,
      unitCostKsh: 2100,
      purchasedOn: "2026-10-01",
      reference: "DEPOT-114",
      actor: "Sam K.",
    });

    expect(result.balance).toBe(20);

    const rows = await stock.stockRows({ locationId: nextgen });
    const line = rows.find((r) => r.variantId === afrigas13)!;
    expect(line.refills).toBe(20);
    expect(line.total).toBe(20);
    expect(line.lastCost).toBe(2100);
    expect(line.costOnHand).toBe(42000);
  });

  it("writes both ledgers: the gas and the cylinder it came in", async () => {
    await stock.recordPurchase({
      locationId: nextgen,
      variantId: afrigas13,
      quantity: 5,
      unitCostKsh: 2000,
      actor: "Sam K.",
    });
    const movements = await stock.movements(afrigas13);

    expect(movements.map((m) => m.operation)).toEqual(["PURCHASE", "PURCHASE"]);
    expect(movements.every((m) => m.unitCostKsh === 2000)).toBe(true);
    expect(movements.some((m) => m.state === "REFILL")).toBe(true);
    expect(movements.some((m) => m.custody === "BRANCH")).toBe(true);
  });

  it("refuses a part cylinder, a negative cost and an anonymous delivery", async () => {
    const base = { locationId: nextgen, variantId: afrigas13, unitCostKsh: 2000, actor: "Sam K." };
    await expect(stock.recordPurchase({ ...base, quantity: 2.5 })).rejects.toThrow(/whole number/);
    await expect(stock.recordPurchase({ ...base, quantity: 5, unitCostKsh: -1 })).rejects.toThrow(
      /cannot be negative/,
    );
    await expect(stock.recordPurchase({ ...base, quantity: 5, actor: "S" })).rejects.toThrow(
      /who received/,
    );
  });
});

describe("the cost the list shows, and the cost a sale takes", () => {
  it("shows the last buy price, but sells from the oldest batch", async () => {
    // October at 2,100, then November at 2,300 — the price went up.
    await stock.recordPurchase({
      locationId: nextgen, variantId: afrigas13, quantity: 10,
      unitCostKsh: 2100, purchasedOn: "2026-10-01", actor: "Sam K.",
    });
    await stock.recordPurchase({
      locationId: nextgen, variantId: afrigas13, quantity: 10,
      unitCostKsh: 2300, purchasedOn: "2026-11-01", actor: "Sam K.",
    });

    // The list shows what it would cost to buy more today.
    const line = (await stock.stockRows({ locationId: nextgen })).find(
      (r) => r.variantId === afrigas13,
    )!;
    expect(line.lastCost).toBe(2300);
    expect(line.costOnHand).toBe(10 * 2100 + 10 * 2300); // 44,000

    // Selling takes the cheap October cylinders first.
    const sold = await stock.consumeFifo({ locationId: nextgen, variantId: afrigas13, quantity: 12 });
    expect(sold.lines).toEqual([
      { lotId: sold.lines[0].lotId, purchasedOn: "2026-10-01", unitCostKsh: 2100, quantity: 10 },
      { lotId: sold.lines[1].lotId, purchasedOn: "2026-11-01", unitCostKsh: 2300, quantity: 2 },
    ]);
    expect(sold.totalCostKsh).toBe(10 * 2100 + 2 * 2300); // 25,600, not 12 × 2,300

    // What is left is the expensive batch, and the list now costs it at 2,300.
    const lots = await stock.lots(afrigas13, { locationId: nextgen });
    expect(lots.map((l) => [l.purchasedOn, l.remaining])).toEqual([["2026-11-01", 8]]);
    expect(
      (await stock.stockRows({ locationId: nextgen })).find((r) => r.variantId === afrigas13)!
        .costOnHand,
    ).toBe(8 * 2300);
  });

  it("refuses to sell more than has been costed, rather than inventing a cost", async () => {
    await stock.recordPurchase({
      locationId: nextgen, variantId: afrigas13, quantity: 3,
      unitCostKsh: 2100, actor: "Sam K.",
    });
    await expect(
      stock.consumeFifo({ locationId: nextgen, variantId: afrigas13, quantity: 5 }),
    ).rejects.toThrow(StockError);
  });
});

describe("reading stock", () => {
  it("separates full from empty and adds them to a total", async () => {
    await stock.recordPurchase({
      locationId: nextgen, variantId: afrigas13, quantity: 20, unitCostKsh: 2100, actor: "Sam K.",
    });
    // Empties come back from customers; they are not stock you can sell.
    await db.query(
      `INSERT INTO inventory_positions (location_id, variant_id, state, quantity)
       VALUES ($1, $2, 'EMPTY', 7)`,
      [nextgen, afrigas13],
    );

    const line = (await stock.stockRows({ locationId: nextgen })).find(
      (r) => r.variantId === afrigas13,
    )!;
    expect(line.refills).toBe(20);
    expect(line.empties).toBe(7);
    expect(line.total).toBe(27);
  });

  it("shows every branch together, or just the one you asked for", async () => {
    await stock.recordPurchase({
      locationId: nextgen, variantId: afrigas13, quantity: 20, unitCostKsh: 2100, actor: "Sam K.",
    });
    await stock.recordPurchase({
      locationId: lavington, variantId: afrigas13, quantity: 5, unitCostKsh: 2200, actor: "Amina S.",
    });

    const all = (await stock.stockRows()).find((r) => r.variantId === afrigas13)!;
    expect(all.refills).toBe(25);

    const onlyNextgen = (await stock.stockRows({ locationId: nextgen })).find(
      (r) => r.variantId === afrigas13,
    )!;
    expect(onlyNextgen.refills).toBe(20);
    expect(onlyNextgen.lastCost).toBe(2100); // Lavington's 2,200 must not leak in
  });

  it("filters the movement history to one branch", async () => {
    await stock.recordPurchase({
      locationId: nextgen, variantId: afrigas13, quantity: 20, unitCostKsh: 2100, actor: "Sam K.",
    });
    await stock.recordPurchase({
      locationId: lavington, variantId: afrigas13, quantity: 5, unitCostKsh: 2200, actor: "Amina S.",
    });

    const everywhere = await stock.movements(afrigas13);
    const onlyNextgen = await stock.movements(afrigas13, { locationId: nextgen });

    expect(everywhere).toHaveLength(4); // two ledgers per delivery
    expect(onlyNextgen).toHaveLength(2);
    expect(onlyNextgen.every((m) => m.locationName === "Nextgen")).toBe(true);
    expect(onlyNextgen[0].actor).toBe("Sam K.");
  });
});
