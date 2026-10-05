import { describe, expect, it } from "vitest";
import {
  Custody,
  GasState,
  LedgerKind,
  NotAtomicError,
  StockErrorCode,
} from "../index";
import { BRANCH, OPENING, VARIANT, context, seeded } from "./helpers";

describe("atomic batches", () => {
  it("commits every line of a valid batch", () => {
    const service = seeded();

    service.sellMany(
      [
        { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 5 },
        { branchId: BRANCH.syokimau, variantId: VARIANT.total13, quantity: 3 },
        { branchId: BRANCH.mlolongo, variantId: VARIANT.afrigas13, quantity: 2 },
      ],
      context({ reference: "EOD-SYK-0510" }),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(18);
    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Refill)).toBe(24);
    expect(service.balance(BRANCH.mlolongo, VARIANT.afrigas13, GasState.Refill)).toBe(10);
    service.assertLedgerMatchesPositions();
  });

  it("writes nothing at all when one line of the batch cannot be served", () => {
    const service = seeded();
    const ledgerBefore = service.ledger.size;

    let caught: unknown;
    try {
      service.sellMany(
        [
          // Fine on its own...
          { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 20 },
          // ...but 20 + 10 is more than the 23 the branch holds.
          { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 10 },
        ],
        context(),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(NotAtomicError);
    expect((caught as NotAtomicError).code).toBe(StockErrorCode.NotAtomic);
    expect((caught as NotAtomicError).details).toMatchObject({
      cause: StockErrorCode.InsufficientStock,
    });

    // The first, perfectly valid line was not written either.
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.ledger.size).toBe(ledgerBefore);
  });

  it("rejects a batch containing an unknown variant without applying the rest", () => {
    const service = seeded();
    const ledgerBefore = service.ledger.size;

    expect(() =>
      service.sellMany(
        [
          { branchId: BRANCH.syokimau, variantId: VARIANT.total6, quantity: 4 },
          { branchId: BRANCH.syokimau, variantId: "var-ghost-99", quantity: 1 },
        ],
        context(),
      ),
    ).toThrow(NotAtomicError);

    expect(service.balance(BRANCH.syokimau, VARIANT.total6, GasState.Refill)).toBe(
      OPENING.total6.refill,
    );
    expect(service.ledger.size).toBe(ledgerBefore);
  });
});

describe("idempotency", () => {
  it("applies a command once even when the same key is submitted twice", () => {
    const service = seeded();
    const key = "MPESA-OPK7Q2X9L4";

    const first = service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context({ idempotencyKey: key }),
    );
    const second = service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context({ idempotencyKey: key }),
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.movementIds).toEqual(first.movementIds);
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill - 3,
    );
  });

  it("treats two different keys as two different sales", () => {
    const service = seeded();

    service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context({ idempotencyKey: "MPESA-AAA" }),
    );
    service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context({ idempotencyKey: "MPESA-BBB" }),
    );

    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill - 6,
    );
  });

  it("replays a purchase the same way", () => {
    const service = seeded();
    const key = "DN-8841";

    service.purchase(
      { branchId: BRANCH.syokimau, variantId: VARIANT.total13, refills: 12 },
      context({ idempotencyKey: key }),
    );
    const replay = service.purchase(
      { branchId: BRANCH.syokimau, variantId: VARIANT.total13, refills: 12 },
      context({ idempotencyKey: key }),
    );

    expect(replay.replayed).toBe(true);
    expect(service.balance(BRANCH.syokimau, VARIANT.total13, GasState.Refill)).toBe(39);
  });
});

describe("audit trail", () => {
  it("keeps an unbroken before/after chain for every position", () => {
    const service = seeded();

    service.purchase(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, refills: 10 },
      context(),
    );
    service.sellRefill(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 7 },
      context(),
    );
    service.exchange(
      { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 2 },
      context(),
    );

    const rows = service
      .movements({ branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13 })
      .filter((m) => m.ledgerKind === LedgerKind.Gas && m.state === GasState.Refill);

    let running = 0;
    for (const row of rows) {
      expect(row.balanceBefore).toBe(running);
      expect(row.balanceAfter).toBe(running + row.quantity);
      running = row.balanceAfter;
    }
    expect(running).toBe(service.balance(BRANCH.syokimau, VARIANT.afrigas13, GasState.Refill));
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it("assigns strictly increasing sequence numbers across both ledgers", () => {
    const service = seeded();
    service.purchase(
      {
        branchId: BRANCH.syokimau,
        variantId: VARIANT.afrigas6,
        refills: 20,
        emptiesReturnedToDepot: 10,
      },
      context(),
    );

    const seqs = service.movements().map((m) => m.seq);
    for (let i = 1; i < seqs.length; i += 1) {
      expect(seqs[i]).toBe(seqs[i - 1] + 1);
    }
  });

  it("reconciles both ledgers after a full day of mixed trading", () => {
    const service = seeded();

    service.purchase(
      {
        branchId: BRANCH.syokimau,
        variantId: VARIANT.afrigas6,
        refills: 60,
        emptiesReturnedToDepot: 30,
      },
      context({ reference: "DN-9001" }),
    );
    service.sellMany(
      [
        { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas6, quantity: 12, emptiesReceived: 9 },
        { branchId: BRANCH.syokimau, variantId: VARIANT.afrigas13, quantity: 6, emptiesReceived: 6 },
        { branchId: BRANCH.mlolongo, variantId: VARIANT.afrigas13, quantity: 4 },
      ],
      context({ reference: "EOD-0510" }),
    );
    service.sellNewCylinder(
      { branchId: BRANCH.syokimau, variantId: VARIANT.total13, quantity: 2 },
      context(),
    );
    service.exchange(
      { branchId: BRANCH.kitengela, variantId: VARIANT.afrigas3, quantity: 5 },
      context(),
    );
    service.transfer(
      {
        fromBranchId: BRANCH.syokimau,
        toBranchId: BRANCH.kitengela,
        variantId: VARIANT.afrigas6,
        refills: 15,
        empties: 8,
      },
      context({ reference: "TRF-2001" }),
    );
    service.returnEmpty(
      {
        branchId: BRANCH.mlolongo,
        variantId: VARIANT.total13,
        quantity: 2,
        companyOwnedShell: true,
      },
      context(),
    );
    service.returnToDepot(
      { branchId: BRANCH.mlolongo, variantId: VARIANT.afrigas13, quantity: 5 },
      context(),
    );
    service.stocktake(
      {
        branchId: BRANCH.kitengela,
        variantId: VARIANT.afrigas3,
        state: GasState.Empty,
        countedQuantity: 12,
      },
      { actor: "Amina S.", reason: "Evening count, 3 kg cage" },
    );

    // The whole day rebuilds from the audit trail alone.
    expect(() => service.assertLedgerMatchesPositions()).not.toThrow();

    // Spot-check the arithmetic the ledgers should have produced.
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Refill)).toBe(
      14 + 60 - 12 - 15,
    );
    expect(service.balance(BRANCH.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(
      36 - 30 + 9 - 8,
    );
    expect(service.balance(BRANCH.kitengela, VARIANT.afrigas6, GasState.Refill)).toBe(22);
    expect(service.balance(BRANCH.kitengela, VARIANT.afrigas6, GasState.Empty)).toBe(17);
    expect(service.balance(BRANCH.mlolongo, VARIANT.total13, GasState.Empty)).toBe(6);
    expect(service.balance(BRANCH.mlolongo, VARIANT.afrigas13, GasState.Empty)).toBe(3);
    expect(service.cylinders(BRANCH.syokimau, VARIANT.total13, Custody.Customer)).toBe(13);
  });
});
