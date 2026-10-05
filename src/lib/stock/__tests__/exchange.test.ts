import { describe, expect, it } from "vitest";
import {
  BrandMismatchError,
  GasState,
  InsufficientStockError,
  SizeMismatchError,
  StockErrorCode,
} from "../index";
import { BRANCH, OPENING, VARIANT, context, seeded } from "./helpers";

describe("cylinder exchange", () => {
  it("swaps a filled cylinder for an empty one of the same variant", () => {
    const service = seeded();

    service.exchange(
      { branchId: BRANCH.syokimau, variantId: VARIANT.total13, quantity: 5 },
      context(),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Refill)).toBe(
      OPENING.total13.refill - 5,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Empty)).toBe(
      OPENING.total13.empty + 5,
    );
    service.assertLedgerMatchesPositions();
  });

  it("refuses to exchange across brands, because schemes are per brand", () => {
    const service = seeded();

    let caught: unknown;
    try {
      service.exchange(
        {
          branchId: BRANCH.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 1,
          emptyVariantId: VARIANT.total13,
        },
        context(),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BrandMismatchError);
    expect((caught as BrandMismatchError).code).toBe(StockErrorCode.BrandMismatch);
    expect((caught as BrandMismatchError).details).toEqual({
      outBrand: "Afri Gas",
      inBrand: "TotalEnergies",
    });

    // Rejected means nothing moved, on either side.
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Empty)).toBe(
      OPENING.total13.empty,
    );
  });

  it("refuses a size mismatch on a like-for-like exchange", () => {
    const service = seeded();

    expect(() =>
      service.exchange(
        {
          branchId: BRANCH.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 1,
          emptyVariantId: VARIANT.afrigas6,
        },
        context(),
      ),
    ).toThrow(SizeMismatchError);

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(
      OPENING.afrigas6.empty,
    );
  });

  it("accepts a deliberate size mismatch and books the shell against its own variant", () => {
    const service = seeded();

    service.exchange(
      {
        branchId: BRANCH.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 2,
        emptyVariantId: VARIANT.afrigas6,
        allowSizeMismatch: true,
      },
      context(),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(21);
    // The empties land on the 6 kg position, not the 13 kg one.
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(38);
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(21);
  });

  it("cannot exchange more cylinders than are filled", () => {
    const service = seeded();

    expect(() =>
      service.exchange(
        { branchId: BRANCH.mlolongo, variantId: VARIANT.afrigas13, quantity: 13 },
        context(),
      ),
    ).toThrow(InsufficientStockError);

    expect(service.balance(BRANCH.mlolongo, VARIANT.afrigas13, GasState.Refill)).toBe(12);
  });

  it("also refuses a cross-brand exchange hidden inside a size mismatch", () => {
    const service = seeded();

    expect(() =>
      service.exchange(
        {
          branchId: BRANCH.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 1,
          emptyVariantId: VARIANT.rubis6,
          allowSizeMismatch: true,
        },
        context(),
      ),
    ).toThrow(BrandMismatchError);
  });
});
