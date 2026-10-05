import { describe, expect, it } from "vitest";
import {
  Custody,
  GasState,
  InsufficientCylindersError,
  InsufficientStockError,
  StockErrorCode,
} from "../index";
import { LOC, OPENING, VARIANT, context, seeded, seededWith } from "./helpers";

describe("cylinder ownership is not gas stock", () => {
  it("a refill sale moves gas only and leaves cylinder custody alone", () => {
    const service = seeded();
    const shellsBefore = service.cylinders(
      LOC.syokimau,
      VARIANT.afrigas13,
      Custody.Branch,
    );

    service.sellRefill(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 6 },
      context(),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill - 6,
    );
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(
      shellsBefore,
    );
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Customer)).toBe(
      15,
    );
  });

  it("an exchange is like-for-like, so custody does not move either", () => {
    const service = seeded();
    const before = service.cylinders(
      LOC.syokimau,
      VARIANT.afrigas13,
      Custody.Branch,
    );

    service.exchange(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 4 },
      context(),
    );

    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(
      before,
    );
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(19);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(25);
  });

  it("a new cylinder sale moves the shell to the customer and takes the gas with it", () => {
    const service = seeded();

    service.sellWithCylinder(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 2 },
      context(),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(21);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(
      OPENING.afrigas13.companyShells - 2,
    );
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Customer)).toBe(
      15 + 2,
    );
    // No empty appears: the shell left filled and stayed out.
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(
      OPENING.afrigas13.empty,
    );

    service.assertLedgerMatchesPositions();
  });

  it("a loan cylinder takes the gas but keeps ownership at the branch", () => {
    const service = seeded();
    const shellsBefore = service.cylinders(
      LOC.syokimau,
      VARIANT.total38,
      Custody.Branch,
    );

    service.sellWithCylinder(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.total38,
        quantity: 1,
        transferCylinderOwnership: false,
      },
      context(),
    );

    expect(service.balance(LOC.syokimau, VARIANT.total38, GasState.Refill)).toBe(3);
    expect(service.cylinders(LOC.syokimau, VARIANT.total38, Custody.Branch)).toBe(
      shellsBefore,
    );
  });

  it("returns a company shell from customer custody to the branch", () => {
    const service = seeded();

    service.returnEmpty(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 3,
        companyOwnedShell: true,
      },
      context(),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(24);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(43);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Customer)).toBe(12);
  });

  it("treats a customer-owned shell as gas stock only, not company property", () => {
    const service = seeded();
    const shellsBefore = service.cylinders(
      LOC.syokimau,
      VARIANT.afrigas13,
      Custody.Branch,
    );

    service.returnEmpty(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context(),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(24);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(
      shellsBefore,
    );
  });

  it("sends company empties back to the depot, moving custody with them", () => {
    const service = seeded();

    service.returnToDepot(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas6, quantity: 20 },
      context(),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(16);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas6, Custody.Branch)).toBe(25);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas6, Custody.Depot)).toBe(20);
  });
});

describe("the two ledgers can disagree, and that is caught", () => {
  it("refuses to sell a new cylinder when there is gas but no company shell", () => {
    // 10 filled cylinders, none of them ours.
    const service = seededWith([
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas13,
        refills: 10,
        empties: 0,
        companyShellsOnSite: 0,
        companyShellsWithCustomers: 0,
      },
    ]);

    // The gas can be sold into a customer's own cylinder...
    service.sellRefill(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 1 },
      context(),
    );
    // ...but not in one of ours.
    let caught: unknown;
    try {
      service.sellWithCylinder(
        { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 1 },
        context(),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InsufficientCylindersError);
    expect((caught as InsufficientCylindersError).code).toBe(
      StockErrorCode.InsufficientCylinders,
    );
    // Nothing was written by the failed command.
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(9);
    expect(service.cylinders(LOC.syokimau, VARIANT.afrigas13, Custody.Customer)).toBe(0);
  });

  it("refuses to sell a new cylinder when there are shells but no gas", () => {
    const service = seededWith([
      {
        locationId: LOC.mlolongo,
        variantId: VARIANT.total13,
        refills: 0,
        empties: 8,
        companyShellsOnSite: 8,
        companyShellsWithCustomers: 0,
      },
    ]);

    expect(() =>
      service.sellWithCylinder(
        { locationId: LOC.mlolongo, variantId: VARIANT.total13, quantity: 1 },
        context(),
      ),
    ).toThrow(InsufficientStockError);

    expect(service.cylinders(LOC.mlolongo, VARIANT.total13, Custody.Branch)).toBe(8);
    expect(service.cylinders(LOC.mlolongo, VARIANT.total13, Custody.Customer)).toBe(0);
  });

  it("refuses to return more company empties to the depot than it owns", () => {
    // Ten empty shells standing at the branch, but only two of them are ours.
    const service = seededWith([
      {
        locationId: LOC.kitengela,
        variantId: VARIANT.afrigas6,
        refills: 0,
        empties: 10,
        companyShellsOnSite: 2,
        companyShellsWithCustomers: 0,
      },
    ]);

    let caught: unknown;
    try {
      service.returnToDepot(
        { locationId: LOC.kitengela, variantId: VARIANT.afrigas6, quantity: 5 },
        context(),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InsufficientCylindersError);
    expect((caught as InsufficientCylindersError).code).toBe(
      StockErrorCode.InsufficientCylinders,
    );
    expect(service.balance(LOC.kitengela, VARIANT.afrigas6, GasState.Empty)).toBe(10);

    // Two is exactly what we own, so that load goes.
    service.returnToDepot(
      { locationId: LOC.kitengela, variantId: VARIANT.afrigas6, quantity: 2 },
      context(),
    );
    expect(service.balance(LOC.kitengela, VARIANT.afrigas6, GasState.Empty)).toBe(8);
    expect(service.cylinders(LOC.kitengela, VARIANT.afrigas6, Custody.Depot)).toBe(2);
    expect(service.cylinders(LOC.kitengela, VARIANT.afrigas6, Custody.Branch)).toBe(0);
  });

  it("leaves cylinder custody alone when a stocktake corrects gas", () => {
    const service = seeded();
    const shellsBefore = service.cylinders(
      LOC.syokimau,
      VARIANT.total13,
      Custody.Branch,
    );

    service.stocktake(
      {
        locationId: LOC.syokimau,
        variantId: VARIANT.total13,
        state: GasState.Refill,
        countedQuantity: 20,
      },
      { actor: "Brian O.", reason: "Evening count found 20 filled, not 27" },
    );

    expect(service.balance(LOC.syokimau, VARIANT.total13, GasState.Refill)).toBe(20);
    expect(service.cylinders(LOC.syokimau, VARIANT.total13, Custody.Branch)).toBe(
      shellsBefore,
    );
    service.assertLedgerMatchesPositions();
  });
});
