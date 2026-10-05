import { describe, expect, it } from "vitest";
import { Custody, GasState, LedgerKind } from "../index";
import { BRANCH, OPENING, VARIANT, context, seeded } from "./helpers";

describe("the example from the brief", () => {
  it("selling one Afri Gas 13 kg refill reduces Afri Gas refills by exactly one", () => {
    const service = seeded();

    service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 1 },
      context(),
    );

    expect(
      service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill),
    ).toBe(OPENING.afrigas13.refill - 1);
    // A plain refill sale moves gas only — no shell came back with it.
    expect(
      service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Empty),
    ).toBe(OPENING.afrigas13.empty);
  });

  it("returning a Total 13 kg empty raises Total empties by one, not Afri Gas", () => {
    const service = seeded();

    service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 1 },
      context(),
    );
    service.returnEmpty(
      { branchId: BRANCH.syokimau, variantId: VARIANT.total13, quantity: 1 },
      context(),
    );

    // Total went up by one...
    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Empty)).toBe(
      OPENING.total13.empty + 1,
    );
    // ...and Afri Gas did not move at all.
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(
      OPENING.afrigas13.empty,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill - 1,
    );
    // Total's saleable stock is untouched by someone handing back a shell.
    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Refill)).toBe(
      OPENING.total13.refill,
    );

    service.assertLedgerMatchesPositions();
  });
});

describe("brand, size and branch isolation", () => {
  it("keeps every brand of the same size in its own position", () => {
    const service = seeded();

    service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.rubis13, quantity: 4 },
      context(),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.rubis13, GasState.Refill)).toBe(
      16 - 4,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Refill)).toBe(
      OPENING.total13.refill,
    );
  });

  it("keeps different sizes of the same brand in their own positions", () => {
    const service = seeded();

    service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas6, quantity: 5 },
      context(),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Refill)).toBe(
      OPENING.afrigas6.refill - 5,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas3, GasState.Refill)).toBe(42);
  });

  it("keeps branches independent: a Syokimau sale does not touch Mlolongo", () => {
    const service = seeded();

    service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 10 },
      context(),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(13);
    expect(service.balance(BRANCH.mlolongo, VARIANT.afrigas13, GasState.Refill)).toBe(12);
    expect(service.balance(BRANCH.kitengela, VARIANT.afrigas3, GasState.Refill)).toBe(25);
  });

  it("records empties received on a sale against the same variant only", () => {
    const service = seeded();

    service.sellRefill(
      {
        branchId: BRANCH.syokimau,
        variantId: VARIANT.afrigas13,
        quantity: 3,
        emptiesReceived: 2,
      },
      context(),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(20);
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(23);
    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Empty)).toBe(
      OPENING.total13.empty,
    );
  });
});

describe("purchases from the depot", () => {
  it("adds filled cylinders and removes the empties sent back", () => {
    const service = seeded();

    service.purchase(
      {
        branchId: BRANCH.syokimau,
        variantId: VARIANT.afrigas6,
        refills: 40,
        emptiesReturnedToDepot: 30,
      },
      context(),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Refill)).toBe(54);
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(6);
    // 40 arrived, 30 left: 10 more company shells standing at the branch.
    expect(
      service.cylinders(BRANCH.syokimau, VARIANT.afrigas6, Custody.Branch),
    ).toBe(OPENING.afrigas6.companyShells + 10);
    expect(service.cylinders(BRANCH.syokimau, VARIANT.afrigas6, Custody.Depot)).toBe(30);

    service.assertLedgerMatchesPositions();
  });

  it("writes an auditable row with before and after balances", () => {
    const service = seeded();
    const receipt = service.purchase(
      { branchId: BRANCH.syokimau, variantId: VARIANT.total13, refills: 12 },
      context({ reference: "DN-8841" }),
    );

    expect(receipt.movementIds.length).toBeGreaterThan(0);
    // A purchase writes a gas row and a custody row; check the gas one.
    const first = service
      .movements({ variantId: VARIANT.total13, ledgerKind: LedgerKind.Gas })
      .filter((m) => m.state === GasState.Refill)
      .at(-1)!;
    expect(first.reference).toBe("DN-8841");
    expect(first.balanceBefore).toBe(OPENING.total13.refill);
    expect(first.balanceAfter).toBe(OPENING.total13.refill + 12);
    expect(first.actor).toBe("Joyce W.");
  });
});

describe("derived figures", () => {
  it("converts filled stock to kilograms using the variant size", () => {
    const service = seeded();
    // Every brand at the branch counts: Afri Gas, TotalEnergies and Rubis.
    const afrigas = 42 * 3 + 14 * 6 + 23 * 13 + 3 * 50;
    const total = 19 * 6 + 27 * 13 + 4 * 38;
    const rubis = 11 * 6 + 16 * 13;
    expect(service.gasKg(BRANCH.syokimau)).toBe(afrigas + total + rubis);
    expect(service.gasKg(BRANCH.syokimau)).toBe(1550);
    expect(service.gasKg(BRANCH.syokimau, VARIANT.afrigas13)).toBe(23 * 13);
  });

  it("values filled stock at retail refill prices", () => {
    const service = seeded();
    expect(service.retailValueKsh(BRANCH.kitengela)).toBe(
      25 * 550 + 7 * 1050 + 5 * 1080,
    );
  });

  it("does not count empties as saleable gas", () => {
    const service = seeded();
    const kgBefore = service.gasKg(BRANCH.syokimau);
    service.returnEmpty(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas50, quantity: 5 },
      context(),
    );
    expect(service.gasKg(BRANCH.syokimau)).toBe(kgBefore);
  });
});
