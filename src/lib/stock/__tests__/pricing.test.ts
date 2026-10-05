import { describe, expect, it } from "vitest";
import { GasState, InvalidPriceError, StockErrorCode } from "../index";
import { LOC, OPENING, VARIANT, context, seeded } from "./helpers";

const LIST_13 = 2350;

/**
 * Prices move — regulars get a rate, hotels get another. That is fine. What is
 * not fine is a price that differs from list with no record of why, so every
 * deviation has to carry a reason, and discounted sales are one query away.
 */
describe("list price is the default", () => {
  it("charges list price when the cashier says nothing about price", () => {
    const service = seeded();

    const receipt = service.sellRefill(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 2 },
      context(),
    );

    const sale = service.sales.all().find((s) => s.id === receipt.saleId)!;
    expect(sale.chargedTotalKsh).toBe(2 * LIST_13);
    expect(sale.listTotalKsh).toBe(2 * LIST_13);
    expect(sale.discountKsh).toBe(0);
    expect(sale.lines[0]?.discountReason).toBeNull();
  });
});

describe("discounts", () => {
  it("records the list price, the charged price and the reason", () => {
    const service = seeded();

    const receipt = service.sellRefill(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 3,
        price: { unitPriceKsh: 2200, discountReason: "Regular customer rate" },
      },
      context({ customer: "Kirimi Hotels Ltd" }),
    );

    const sale = service.sales.all().find((s) => s.id === receipt.saleId)!;
    expect(sale.lines[0]).toMatchObject({
      listPriceKsh: LIST_13,
      unitPriceKsh: 2200,
      discountReason: "Regular customer rate",
      listTotalKsh: 3 * LIST_13,
      chargedTotalKsh: 3 * 2200,
    });
    expect(sale.discountKsh).toBe(3 * (LIST_13 - 2200));
  });

  it("refuses a discount with no reason", () => {
    const service = seeded();

    let caught: unknown;
    try {
      service.sellRefill(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 1,
          price: { unitPriceKsh: 1500 },
        },
        context(),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidPriceError);
    expect((caught as InvalidPriceError).code).toBe(StockErrorCode.InvalidPrice);
    expect((caught as InvalidPriceError).details).toMatchObject({
      listPriceKsh: LIST_13,
      unitPriceKsh: 1500,
    });
  });

  it("refuses a reason too short to mean anything", () => {
    const service = seeded();
    expect(() =>
      service.sellRefill(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 1,
          price: { unitPriceKsh: 1500, discountReason: "ok" },
        },
        context(),
      ),
    ).toThrow(InvalidPriceError);
  });

  it("moves no stock when the price is invalid", () => {
    const service = seeded();
    const ledgerBefore = service.ledger.size;

    expect(() =>
      service.exchange(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 4,
          price: { unitPriceKsh: 900 },
        },
        context(),
      ),
    ).toThrow(InvalidPriceError);

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.ledger.size).toBe(ledgerBefore);
    expect(service.sales.size).toBe(0);
  });

  it("refuses a price above list with no reason either", () => {
    const service = seeded();
    expect(() =>
      service.sellRefill(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 1,
          price: { unitPriceKsh: 2600 },
        },
        context(),
      ),
    ).toThrow(InvalidPriceError);
  });

  it("accepts an agreed rate above list once the reason is on record", () => {
    const service = seeded();

    const receipt = service.sellRefill(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 1,
        price: { unitPriceKsh: 2600, discountReason: "After-hours delivery to Athi River" },
      },
      context(),
    );

    const sale = service.sales.all().find((s) => s.id === receipt.saleId)!;
    // Negative variance: the customer paid above list.
    expect(sale.discountKsh).toBe(LIST_13 - 2600);
  });

  it("refuses a zero or negative price", () => {
    const service = seeded();
    for (const unitPriceKsh of [0, -500]) {
      expect(() =>
        service.sellRefill(
          {
            locationId: LOC.syokimau,
            variantId: VARIANT.afrigas13,
            quantity: 1,
            price: { unitPriceKsh, discountReason: "Free of charge promotion" },
          },
          context(),
        ),
      ).toThrow(InvalidPriceError);
    }
  });
});

describe("discounts are easy to see", () => {
  it("finds every discounted sale in one call", () => {
    const service = seeded();

    service.sellRefill(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 1 },
      context(),
    );
    service.sellRefill(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 1,
        price: { unitPriceKsh: 2100, discountReason: "Neighbourhood price match" },
      },
      context(),
    );
    service.sellRefill(
      {
        locationId: LOC.mlolongo,
        variantId: VARIANT.total13,
        quantity: 1,
        price: { unitPriceKsh: 2000, discountReason: "Bulk standing order" },
      },
      context(),
    );

    expect(service.sales.all()).toHaveLength(3);
    expect(service.sales.discounted()).toHaveLength(2);
    expect(service.sales.totalDiscountKsh()).toBe(
      (LIST_13 - 2100) + (2400 - 2000),
    );
    expect(service.sales.totalChargedKsh()).toBe(LIST_13 + 2100 + 2000);
  });

  it("prices every line of a batch on its own terms", () => {
    const service = seeded();

    const receipt = service.sellMany(
      LOC.syokimau,
      [
        { variantId: VARIANT.afrigas13, quantity: 2 },
        {
          variantId: VARIANT.afrigas13,
          quantity: 5,
          price: { unitPriceKsh: 2150, discountReason: "Bulk purchase, 5 cylinders" },
        },
      ],
      context(),
    );

    const sale = service.sales.all().find((s) => s.id === receipt.saleId)!;
    expect(sale.lines).toHaveLength(2);
    expect(sale.lines[0]?.discountReason).toBeNull();
    expect(sale.lines[1]?.discountReason).toBe("Bulk purchase, 5 cylinders");
    expect(sale.chargedTotalKsh).toBe(2 * LIST_13 + 5 * 2150);
    expect(sale.discountKsh).toBe(5 * (LIST_13 - 2150));
  });

  it("rejects the whole batch if one line's price is unexplained", () => {
    const service = seeded();
    const ledgerBefore = service.ledger.size;

    expect(() =>
      service.sellMany(
        LOC.syokimau,
        [
          { variantId: VARIANT.afrigas13, quantity: 2 },
          { variantId: VARIANT.total13, quantity: 1, price: { unitPriceKsh: 1000 } },
        ],
        context(),
      ),
    ).toThrow(InvalidPriceError);

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.ledger.size).toBe(ledgerBefore);
    expect(service.sales.size).toBe(0);
  });
});
