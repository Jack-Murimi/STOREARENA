import { describe, expect, it } from "vitest";
import {
  Custody,
  GasState,
  InactiveBranchError,
  InsufficientStockError,
  InvalidQuantityError,
  LedgerKind,
  Operation,
  SameBranchTransferError,
  StockErrorCode,
} from "../index";
import { BRANCH, OPENING, VARIANT, context, seeded } from "./helpers";

/** Total refills of one variant across every branch. */
function refillsEverywhere(
  service: ReturnType<typeof seeded>,
  variantId: string,
): number {
  return [BRANCH.syokimau, BRANCH.mlolongo, BRANCH.kitengela].reduce(
    (sum, branchId) => sum + service.balance(branchId, variantId, GasState.Refill),
    0,
  );
}

describe("inter-branch transfers", () => {
  it("moves filled and empty cylinders, and the company shells with them", () => {
    const service = seeded();

    service.transfer(
      {
        fromBranchId: BRANCH.syokimau,
        toBranchId: BRANCH.mlolongo,
        variantId: VARIANT.afrigas13,
        refills: 8,
        empties: 5,
      },
      context({ reference: "TRF-1001" }),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(15);
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Empty)).toBe(16);
    expect(service.balance(BRANCH.mlolongo, VARIANT.afrigas13, GasState.Refill)).toBe(20);
    expect(service.balance(BRANCH.mlolongo, VARIANT.afrigas13, GasState.Empty)).toBe(13);

    expect(service.cylinders(BRANCH.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(
      OPENING.afrigas13.companyShells - 13,
    );
    expect(service.cylinders(BRANCH.mlolongo, VARIANT.afrigas13, Custody.Branch)).toBe(
      18 + 13,
    );

    service.assertLedgerMatchesPositions();
  });

  it("conserves stock: nothing is created or destroyed by a transfer", () => {
    const service = seeded();
    const before = refillsEverywhere(service, VARIANT.afrigas13);

    service.transfer(
      {
        fromBranchId: BRANCH.mlolongo,
        toBranchId: BRANCH.syokimau,
        variantId: VARIANT.afrigas13,
        refills: 5,
      },
      context(),
    );

    expect(refillsEverywhere(service, VARIANT.afrigas13)).toBe(before);
  });

  it("can open a position at a branch that never stocked the variant", () => {
    const service = seeded();
    expect(service.balance(BRANCH.kitengela, VARIANT.total13, GasState.Refill)).toBe(0);

    service.transfer(
      {
        fromBranchId: BRANCH.syokimau,
        toBranchId: BRANCH.kitengela,
        variantId: VARIANT.total13,
        refills: 6,
      },
      context(),
    );

    expect(service.balance(BRANCH.kitengela, VARIANT.total13, GasState.Refill)).toBe(6);
    expect(service.cylinders(BRANCH.kitengela, VARIANT.total13, Custody.Branch)).toBe(6);
  });

  it("names the branch at the other end on both sides of the audit trail", () => {
    const service = seeded();

    service.transfer(
      {
        fromBranchId: BRANCH.syokimau,
        toBranchId: BRANCH.mlolongo,
        variantId: VARIANT.total6,
        refills: 3,
      },
      context({ reference: "TRF-1002" }),
    );

    const rows = service
      .movements({ operation: Operation.Transfer, ledgerKind: LedgerKind.Gas })
      .filter((m) => m.reference === "TRF-1002");

    expect(rows).toHaveLength(2);
    const out = rows.find((m) => m.branchId === BRANCH.syokimau)!;
    const incoming = rows.find((m) => m.branchId === BRANCH.mlolongo)!;
    expect(out.quantity).toBe(-3);
    expect(out.counterpartyBranchId).toBe(BRANCH.mlolongo);
    expect(incoming.quantity).toBe(3);
    expect(incoming.counterpartyBranchId).toBe(BRANCH.syokimau);
  });
});

describe("transfer validation", () => {
  it("rejects a transfer from a branch to itself", () => {
    const service = seeded();

    let caught: unknown;
    try {
      service.transfer(
        {
          fromBranchId: BRANCH.syokimau,
          toBranchId: BRANCH.syokimau,
          variantId: VARIANT.afrigas13,
          refills: 1,
        },
        context(),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SameBranchTransferError);
    expect((caught as SameBranchTransferError).code).toBe(
      StockErrorCode.SameBranchTransfer,
    );
  });

  it("rejects a transfer that moves nothing", () => {
    const service = seeded();

    expect(() =>
      service.transfer(
        {
          fromBranchId: BRANCH.syokimau,
          toBranchId: BRANCH.mlolongo,
          variantId: VARIANT.afrigas13,
        },
        context(),
      ),
    ).toThrow(InvalidQuantityError);
  });

  it("rejects a transfer the source cannot cover, and moves nothing", () => {
    const service = seeded();

    expect(() =>
      service.transfer(
        {
          fromBranchId: BRANCH.mlolongo,
          toBranchId: BRANCH.kitengela,
          variantId: VARIANT.afrigas13,
          refills: 40,
        },
        context(),
      ),
    ).toThrow(InsufficientStockError);

    expect(service.balance(BRANCH.mlolongo, VARIANT.afrigas13, GasState.Refill)).toBe(12);
    expect(service.balance(BRANCH.kitengela, VARIANT.afrigas13, GasState.Refill)).toBe(0);
    expect(service.cylinders(BRANCH.mlolongo, VARIANT.afrigas13, Custody.Branch)).toBe(18);
  });

  it("rejects a transfer to a closed branch and leaves the source untouched", () => {
    const service = seeded();

    expect(() =>
      service.transfer(
        {
          fromBranchId: BRANCH.syokimau,
          toBranchId: BRANCH.athiRiver,
          variantId: VARIANT.afrigas13,
          refills: 5,
        },
        context(),
      ),
    ).toThrow(InactiveBranchError);

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.cylinders(BRANCH.syokimau, VARIANT.afrigas13, Custody.Branch)).toBe(
      OPENING.afrigas13.companyShells,
    );
  });

  it("moves empties on their own and takes the company shells with them", () => {
    const service = seeded();

    service.transfer(
      {
        fromBranchId: BRANCH.syokimau,
        toBranchId: BRANCH.kitengela,
        variantId: VARIANT.afrigas6,
        empties: 12,
      },
      context(),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(24);
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Refill)).toBe(
      OPENING.afrigas6.refill,
    );
    expect(service.balance(BRANCH.kitengela, VARIANT.afrigas6, GasState.Empty)).toBe(21);
    expect(service.cylinders(BRANCH.syokimau, VARIANT.afrigas6, Custody.Branch)).toBe(33);
    expect(service.cylinders(BRANCH.kitengela, VARIANT.afrigas6, Custody.Branch)).toBe(26);

    service.assertLedgerMatchesPositions();
  });
});
