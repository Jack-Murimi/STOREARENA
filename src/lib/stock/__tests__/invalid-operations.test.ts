import { describe, expect, it } from "vitest";
import {
  GasState,
  InsufficientStockError,
  InvalidActorError,
  InvalidQuantityError,
  InvalidReasonError,
  StockError,
  StockErrorCode,
  UnsupportedStockModelError,
} from "../index";
import { LOC, OPENING, VARIANT, context, seeded } from "./helpers";

/** Assert a command failed and changed nothing at all. */
function expectNoEffect(
  service: ReturnType<typeof seeded>,
  locationId: string,
  variantId: string,
  ledgerSizeBefore: number,
  run: () => unknown,
): StockError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(StockError);
  expect(service.ledger.size).toBe(ledgerSizeBefore);
  expect(service.balance(locationId, variantId, GasState.Refill)).toBe(
    OPENING.afrigas13.refill,
  );
  expect(service.balance(locationId, variantId, GasState.Empty)).toBe(
    OPENING.afrigas13.empty,
  );
  return caught as StockError;
}

describe("unknown entities", () => {
  it("rejects a branch that does not exist", () => {
    const service = seeded();
    const before = service.ledger.size;

    const error = expectNoEffect(
      service,
      LOC.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.sellRefill(
          {
            locationId: "br-nowhere",
            variantId: VARIANT.afrigas13,
            quantity: 1,
          },
          context(),
        ),
    );
    expect(error.code).toBe(StockErrorCode.UnknownLocation);
  });

  it("rejects a variant that does not exist", () => {
    const service = seeded();
    const before = service.ledger.size;

    const error = expectNoEffect(
      service,
      LOC.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.sellRefill(
          {
            locationId: LOC.syokimau,
            variantId: "var-ghost-99",
            quantity: 1,
          },
          context(),
        ),
    );
    expect(error.code).toBe(StockErrorCode.UnknownVariant);
  });

  it("rejects a closed branch", () => {
    const service = seeded();
    const before = service.ledger.size;

    const error = expectNoEffect(
      service,
      LOC.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.purchase(
          {
            locationId: LOC.athiRiver,
            variantId: VARIANT.afrigas13,
            refills: 20,
          },
          context(),
        ),
    );
    expect(error.code).toBe(StockErrorCode.InactiveLocation);
  });

  it("rejects an accessory, which has no REFILL/EMPTY lifecycle", () => {
    const service = seeded();
    const before = service.ledger.size;

    let caught: unknown;
    try {
      service.purchase(
        { locationId: LOC.syokimau, variantId: VARIANT.regulator, refills: 10 },
        context(),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnsupportedStockModelError);
    expect((caught as UnsupportedStockModelError).code).toBe(
      StockErrorCode.UnsupportedStockModel,
    );
    expect(service.ledger.size).toBe(before);
  });
});

describe("invalid quantities", () => {
  const bad = [0, -1, -50, 2.5, Number.NaN];

  it.each(bad)("rejects a sale quantity of %s", (quantity) => {
    const service = seeded();
    const before = service.ledger.size;

    const error = expectNoEffect(
      service,
      LOC.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.sellRefill(
          { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity },
          context(),
        ),
    );
    expect(error).toBeInstanceOf(InvalidQuantityError);
    expect(error.code).toBe(StockErrorCode.InvalidQuantity);
  });

  it.each(bad)("rejects a purchase of %s filled cylinders", (refills) => {
    const service = seeded();
    expect(() =>
      service.purchase(
        { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, refills },
        context(),
      ),
    ).toThrow(InvalidQuantityError);
  });

  it("rejects more empties received than cylinders sold", () => {
    const service = seeded();
    expect(() =>
      service.sellRefill(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 2,
          emptiesReceived: 3,
        },
        context(),
      ),
    ).toThrow(InvalidQuantityError);
  });

  it("rejects a negative counted quantity on a stocktake", () => {
    const service = seeded();
    expect(() =>
      service.stocktake(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          state: GasState.Refill,
          countedQuantity: -3,
        },
        { actor: "Brian O.", reason: "Counted during the evening audit" },
      ),
    ).toThrow(InvalidQuantityError);
  });
});

describe("insufficient stock", () => {
  it("cannot sell more refills than the branch holds", () => {
    const service = seeded();
    const before = service.ledger.size;

    const error = expectNoEffect(
      service,
      LOC.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.sellRefill(
          { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 24 },
          context(),
        ),
    );

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect(error.code).toBe(StockErrorCode.InsufficientStock);
    expect(error.details).toMatchObject({
      requested: 24,
      available: OPENING.afrigas13.refill,
      state: "REFILL",
    });
  });

  it("cannot sell the last cylinder of another branch's stock", () => {
    const service = seeded();
    expect(() =>
      service.sellRefill(
        { locationId: LOC.kitengela, variantId: VARIANT.afrigas13, quantity: 1 },
        context(),
      ),
    ).toThrow(InsufficientStockError);
  });

  it("cannot return more empties to the depot than are standing there", () => {
    const service = seeded();
    expect(() =>
      service.returnToDepot(
        { locationId: LOC.mlolongo, variantId: VARIANT.afrigas13, quantity: 9 },
        context(),
      ),
    ).toThrow(InsufficientStockError);
    expect(service.balance(LOC.mlolongo, VARIANT.afrigas13, GasState.Empty)).toBe(8);
  });
});

describe("stocktake discipline", () => {
  it.each([undefined, "", "   ", "typo"])("rejects the reason %j", (reason) => {
    const service = seeded();
    expect(() =>
      service.stocktake(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          state: GasState.Refill,
          countedQuantity: 20,
        },
        { actor: "Brian O.", reason },
      ),
    ).toThrow(InvalidReasonError);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
  });

  it("accepts a correction that matches the count, and still records it", () => {
    const service = seeded();
    const before = service.ledger.size;

    service.stocktake(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        state: GasState.Refill,
        countedQuantity: OPENING.afrigas13.refill,
      },
      { actor: "Brian O.", reason: "Evening count agreed with the system" },
    );

    // Nothing moved, but the count itself is on the audit trail.
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.ledger.size).toBe(before + 1);
    expect(service.movements().at(-1)?.quantity).toBe(0);
  });

  it("rejects an empty batch", () => {
    const service = seeded();
    expect(() =>
      service.stocktakeMany([], {
        actor: "Brian O.",
        reason: "Nothing to count today",
      }),
    ).toThrow(InvalidQuantityError);
  });
});

describe("attribution", () => {
  it.each(["", "   ", "x"])("rejects the actor %j", (actor) => {
    const service = seeded();
    const before = service.ledger.size;

    expect(() =>
      service.sellRefill(
        { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 1 },
        { actor, reference: "TILL-77" },
      ),
    ).toThrow(InvalidActorError);

    expect(service.ledger.size).toBe(before);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
  });

  it("names the actor on every movement it writes", () => {
    const service = seeded();

    service.purchase(
      { locationId: LOC.syokimau, variantId: VARIANT.total13, refills: 10 },
      { actor: "Brian O.", reference: "DN-1" },
    );

    const rows = service.movements({ reference: "DN-1" });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actor).toBe("Brian O.");
      expect(row.reason.length).toBeGreaterThanOrEqual(5);
    }
  });
});
