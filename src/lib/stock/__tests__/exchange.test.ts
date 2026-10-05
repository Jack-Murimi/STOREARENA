import { describe, expect, it } from "vitest";
import {
  GasState,
  InsufficientStockError,
  SizeMismatchError,
} from "../index";
import { LOC, OPENING, VARIANT, context, seeded } from "./helpers";

describe("cylinder exchange", () => {
  it("swaps a filled cylinder for an empty one of the same variant", () => {
    const service = seeded();

    service.exchange(
      { locationId: LOC.syokimau, variantId: VARIANT.total13, quantity: 5 },
      context(),
    );

    expect(service.balance(LOC.syokimau, VARIANT.total13, GasState.Refill)).toBe(
      OPENING.total13.refill - 5,
    );
    expect(service.balance(LOC.syokimau, VARIANT.total13, GasState.Empty)).toBe(
      OPENING.total13.empty + 5,
    );
    service.assertLedgerMatchesPositions();
  });

  it("accepts a different brand back, because customers hand over whatever they have", () => {
    const service = seeded();

    service.exchange(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 2,
        emptyVariantId: VARIANT.total13,
      },
      context(),
    );

    // Two Afri Gas 13 kg refills went out...
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(21);
    // ...and the Total shells came in against Total, not against Afri Gas.
    expect(service.balance(LOC.syokimau, VARIANT.total13, GasState.Empty)).toBe(11);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(21);
  });

  it("sends a foreign-brand empty back to that brand's depot, not ours", () => {
    const service = seeded();

    // A Rubis 13 kg shell came in during an Afri Gas sale.
    service.exchange(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 1,
        emptyVariantId: VARIANT.rubis13,
      },
      context(),
    );
    expect(service.balance(LOC.syokimau, VARIANT.rubis13, GasState.Empty)).toBe(6);

    // Returning it reduces the Rubis position, and Afri Gas is untouched.
    service.returnToDepot(
      { locationId: LOC.syokimau, variantId: VARIANT.rubis13, quantity: 1 },
      context(),
    );
    expect(service.balance(LOC.syokimau, VARIANT.rubis13, GasState.Empty)).toBe(5);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(21);
  });

  it("still refuses a different size, which is genuinely rare", () => {
    const service = seeded();

    expect(() =>
      service.exchange(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 1,
          emptyVariantId: VARIANT.afrigas6,
        },
        context(),
      ),
    ).toThrow(SizeMismatchError);

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.balance(LOC.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(
      OPENING.afrigas6.empty,
    );
  });

  it("refuses a size mismatch even when the brand also differs", () => {
    const service = seeded();

    expect(() =>
      service.exchange(
        {
          locationId: LOC.syokimau,
          variantId: VARIANT.afrigas13,
          quantity: 1,
          emptyVariantId: VARIANT.rubis6,
        },
        context(),
      ),
    ).toThrow(SizeMismatchError);
  });

  it("accepts a deliberate size mismatch and books the shell against its own variant", () => {
    const service = seeded();

    service.exchange(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 2,
        emptyVariantId: VARIANT.afrigas6,
        allowSizeMismatch: true,
      },
      context({ reason: "Customer only had 6 kg shells to hand back" }),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(21);
    // The empties land on the 6 kg position, not the 13 kg one.
    expect(service.balance(LOC.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(38);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(21);
  });

  it("cannot exchange more cylinders than are filled", () => {
    const service = seeded();

    expect(() =>
      service.exchange(
        { locationId: LOC.mlolongo, variantId: VARIANT.afrigas13, quantity: 13 },
        context(),
      ),
    ).toThrow(InsufficientStockError);

    expect(service.balance(LOC.mlolongo, VARIANT.afrigas13, GasState.Refill)).toBe(12);
  });
});
