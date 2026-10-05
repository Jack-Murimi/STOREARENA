import { describe, expect, it } from "vitest";
import { Channel, Custody, GasState, InsufficientStockError, LocationKind } from "../index";
import { LOC, OPENING, VARIANT, context, seeded } from "./helpers";

/**
 * Most sales happen at the customer's door, not over the counter. A rider's van
 * is therefore a real stock location: it is loaded in the morning, sells all
 * day, and is reconciled at night. What is on the road is never invisible.
 */
describe("a rider's day", () => {
  it("loading the van takes the stock off the branch", () => {
    const service = seeded();

    service.transfer(
      {
        fromLocationId: LOC.syokimau,
        toLocationId: LOC.van1,
        variantId: VARIANT.afrigas13,
        refills: 12,
      },
      context({ actor: "Brian O.", reference: "VAN-LOAD-0510" }),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(11);
    expect(service.balance(LOC.van1, VARIANT.afrigas13, GasState.Refill)).toBe(12);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(28);
    expect(service.cylinders(LOC.van1, VARIANT.afrigas13, Custody.Branch)).toBe(12);

    // Nothing was created: branch plus van still adds up to the opening count.
    expect(
      service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill) +
        service.balance(LOC.van1, VARIANT.afrigas13, GasState.Refill),
    ).toBe(OPENING.afrigas13.refill);
  });

  it("sells at the door from the van, and calls it a delivery", () => {
    const service = seeded();
    service.transfer(
      {
        fromLocationId: LOC.syokimau,
        toLocationId: LOC.van1,
        variantId: VARIANT.afrigas13,
        refills: 12,
      },
      context({ actor: "Brian O." }),
    );

    const receipt = service.exchange(
      { locationId: LOC.van1, variantId: VARIANT.afrigas13, quantity: 9 },
      context({ actor: "Brian O.", customer: "Kathomi Guest House" }),
    );

    const sale = service.sales.all().find((s) => s.id === receipt.saleId)!;
    expect(sale.channel).toBe(Channel.Delivery);
    expect(sale.actor).toBe("Brian O.");
    expect(sale.customer).toBe("Kathomi Guest House");

    // The empties are with the rider, not at the branch.
    expect(service.balance(LOC.van1, VARIANT.afrigas13, GasState.Refill)).toBe(3);
    expect(service.balance(LOC.van1, VARIANT.afrigas13, GasState.Empty)).toBe(9);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(
      OPENING.afrigas13.empty,
    );
  });

  it("calls a counter sale a walk-in", () => {
    const service = seeded();

    const receipt = service.exchange(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 1 },
      context(),
    );

    const sale = service.sales.all().find((s) => s.id === receipt.saleId)!;
    expect(sale.channel).toBe(Channel.WalkIn);
  });

  it("cannot sell from the van what the van does not carry", () => {
    const service = seeded();
    service.transfer(
      {
        fromLocationId: LOC.syokimau,
        toLocationId: LOC.van1,
        variantId: VARIANT.afrigas13,
        refills: 4,
      },
      context({ actor: "Brian O." }),
    );

    // The branch has 19 left, but the rider only has 4 with him.
    expect(() =>
      service.exchange(
        { locationId: LOC.van1, variantId: VARIANT.afrigas13, quantity: 5 },
        context({ actor: "Brian O." }),
      ),
    ).toThrow(InsufficientStockError);

    expect(service.balance(LOC.van1, VARIANT.afrigas13, GasState.Refill)).toBe(4);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(19);
  });

  it("reconciles at the end of the shift: unsold cylinders and empties come back", () => {
    const service = seeded();

    service.transfer(
      {
        fromLocationId: LOC.syokimau,
        toLocationId: LOC.van1,
        variantId: VARIANT.afrigas13,
        refills: 12,
      },
      context({ actor: "Brian O.", reference: "VAN-LOAD-0510" }),
    );
    service.exchange(
      { locationId: LOC.van1, variantId: VARIANT.afrigas13, quantity: 9 },
      context({ actor: "Brian O." }),
    );
    service.transfer(
      {
        fromLocationId: LOC.van1,
        toLocationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        refills: 3,
        empties: 9,
      },
      context({ actor: "Brian O.", reference: "VAN-RETURN-0510" }),
    );

    // The van is empty again...
    expect(service.balance(LOC.van1, VARIANT.afrigas13, GasState.Refill)).toBe(0);
    expect(service.balance(LOC.van1, VARIANT.afrigas13, GasState.Empty)).toBe(0);
    expect(service.cylinders(LOC.van1, VARIANT.afrigas13, Custody.Branch)).toBe(0);

    // ...and the branch shows exactly what the day did: 9 sold, 9 empties in.
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(14);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(30);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(
      OPENING.afrigas13.companyShells,
    );

    service.assertLedgerMatchesPositions();
  });

  it("reports what is currently on the road", () => {
    const service = seeded();
    service.transfer(
      {
        fromLocationId: LOC.syokimau,
        toLocationId: LOC.van1,
        variantId: VARIANT.afrigas13,
        refills: 12,
      },
      context({ actor: "Brian O." }),
    );
    service.transfer(
      {
        fromLocationId: LOC.mlolongo,
        toLocationId: LOC.van2,
        variantId: VARIANT.afrigas13,
        refills: 6,
      },
      context({ actor: "Amina S." }),
    );

    expect(service.gasKg(LOC.van1)).toBe(12 * 13);
    expect(service.gasKg(LOC.van2)).toBe(6 * 13);
    expect(service.positions(LOC.van1)[0]?.cylinders).toBe(12);
    expect(service.locations.vansOf(LOC.syokimau).map((v) => v.code)).toEqual(["VAN-01"]);
  });

  it("treats a van as a location, not a branch, in the registry", () => {
    const service = seeded();
    expect(service.locations.require(LOC.van1).kind).toBe(LocationKind.Van);
    expect(service.locations.require(LOC.syokimau).kind).toBe(LocationKind.Branch);
    expect(service.locations.branches()).toHaveLength(4);
    expect(service.locations.vans()).toHaveLength(2);
  });
});
