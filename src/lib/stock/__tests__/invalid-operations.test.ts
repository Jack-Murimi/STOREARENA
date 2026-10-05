import { describe, expect, it } from "vitest";
import {
  GasState,
  InsufficientStockError,
  InvalidQuantityError,
  InvalidReasonError,
  StockError,
  StockErrorCode,
  UnsupportedStockModelError,
} from "../index";
import { BRANCH, OPENING, VARIANT, context, seeded } from "./helpers";

/** Assert a command failed and changed nothing at all. */
function expectNoEffect(
  service: ReturnType<typeof seeded>,
  branchId: string,
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
  expect(service.balance(branchId, variantId, GasState.Refill)).toBe(
    OPENING.afrigas13.refill,
  );
  expect(service.balance(branchId, variantId, GasState.Empty)).toBe(
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
      BRANCH.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.sellRefill(
          {
            branchId: "br-nowhere",
            variantId: VARIANT.afrigas13,
            quantity: 1,
          },
          context(),
        ),
    );
    expect(error.code).toBe(StockErrorCode.UnknownBranch);
  });

  it("rejects a variant that does not exist", () => {
    const service = seeded();
    const before = service.ledger.size;

    const error = expectNoEffect(
      service,
      BRANCH.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.sellRefill(
          {
            branchId: BRANCH.syokimau,
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
      BRANCH.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.purchase(
          {
            branchId: BRANCH.athiRiver,
            variantId: VARIANT.afrigas13,
            refills: 20,
          },
          context(),
        ),
    );
    expect(error.code).toBe(StockErrorCode.InactiveBranch);
  });

  it("rejects an accessory, which has no REFILL/EMPTY lifecycle", () => {
    const service = seeded();
    const before = service.ledger.size;

    let caught: unknown;
    try {
      service.purchase(
        { branchId: BRANCH.syokimau, variantId: VARIANT.regulator, refills: 10 },
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
      BRANCH.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.sellRefill(
          { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity },
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
        { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, refills },
        context(),
      ),
    ).toThrow(InvalidQuantityError);
  });

  it("rejects more empties received than cylinders sold", () => {
    const service = seeded();
    expect(() =>
      service.sellRefill(
        {
          branchId: BRANCH.syokimau,
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
          branchId: BRANCH.syokimau,
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
      BRANCH.syokimau,
      VARIANT.afrigas13,
      before,
      () =>
        service.sellRefill(
          { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 24 },
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
        { branchId: BRANCH.kitengela, variantId: VARIANT.afrigas13, quantity: 1 },
        context(),
      ),
    ).toThrow(InsufficientStockError);
  });

  it("cannot return more empties to the depot than are standing there", () => {
    const service = seeded();
    expect(() =>
      service.returnToDepot(
        { branchId: BRANCH.mlolongo, variantId: VARIANT.afrigas13, quantity: 9 },
        context(),
      ),
    ).toThrow(InsufficientStockError);
    expect(service.balance(BRANCH.mlolongo, VARIANT.afrigas13, GasState.Empty)).toBe(8);
  });
});

describe("stocktake discipline", () => {
  it.each([undefined, "", "   ", "typo"])("rejects the reason %j", (reason) => {
    const service = seeded();
    expect(() =>
      service.stocktake(
        {
          branchId: BRANCH.syokimau,
          variantId: VARIANT.afrigas13,
          state: GasState.Refill,
          countedQuantity: 20,
        },
        { actor: "Brian O.", reason },
      ),
    ).toThrow(InvalidReasonError);
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
  });

  it("accepts a correction that matches the count, and still records it", () => {
    const service = seeded();
    const before = service.ledger.size;

    service.stocktake(
      {
        branchId: BRANCH.syokimau,
        variantId: VARIANT.afrigas13,
        state: GasState.Refill,
        countedQuantity: OPENING.afrigas13.refill,
      },
      { actor: "Brian O.", reason: "Evening count agreed with the system" },
    );

    // Nothing moved, but the count itself is on the audit trail.
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
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
