import { describe, expect, it } from "vitest";
import {
  Channel,
  Custody,
  GasState,
  LedgerKind,
  NotAtomicError,
  StockErrorCode,
  UnknownEntityError,
} from "../index";
import { LOC, OPENING, VARIANT, context, seeded } from "./helpers";

describe("atomic batches", () => {
  it("commits every line of a valid batch as one ticket", () => {
    const service = seeded();

    const receipt = service.sellMany(
      LOC.syokimau,
      [
        { variantId: VARIANT.afrigas13, quantity: 5 },
        { variantId: VARIANT.total13, quantity: 3 },
        { variantId: VARIANT.afrigas6, quantity: 4, emptiesReceived: 4 },
      ],
      context({ reference: "EOD-SYK-0510" }),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(18);
    expect(service.balance(LOC.syokimau, VARIANT.total13, GasState.Refill)).toBe(24);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas6, GasState.Refill)).toBe(10);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(40);
    expect(receipt.saleId).not.toBeNull();

    const sale = service.sales.all().find((s) => s.id === receipt.saleId)!;
    expect(sale.lines).toHaveLength(3);
    expect(sale.channel).toBe(Channel.WalkIn);
    expect(sale.chargedTotalKsh).toBe(5 * 2350 + 3 * 2400 + 4 * 1050);
    service.assertLedgerMatchesPositions();
  });

  it("writes nothing at all when one line of the batch cannot be served", () => {
    const service = seeded();
    const ledgerBefore = service.ledger.size;
    const salesBefore = service.sales.size;

    let caught: unknown;
    try {
      service.sellMany(
        LOC.syokimau,
        [
          // Fine on its own...
          { variantId: VARIANT.afrigas13, quantity: 20 },
          // ...but 20 + 10 is more than the 23 the branch holds.
          { variantId: VARIANT.afrigas13, quantity: 10 },
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
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill,
    );
    expect(service.ledger.size).toBe(ledgerBefore);
    expect(service.sales.size).toBe(salesBefore);
  });

  it("rejects a batch containing an unknown variant without applying the rest", () => {
    const service = seeded();
    const ledgerBefore = service.ledger.size;

    // Every line is validated before any stock is touched, so the caller gets
    // the real reason rather than a rollback wrapper.
    let caught: unknown;
    try {
      service.sellMany(
        LOC.syokimau,
        [
          { variantId: VARIANT.total6, quantity: 4 },
          { variantId: "var-ghost-99", quantity: 1 },
        ],
        context(),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownEntityError);
    expect((caught as UnknownEntityError).code).toBe(StockErrorCode.UnknownVariant);

    expect(service.balance(LOC.syokimau, VARIANT.total6, GasState.Refill)).toBe(
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
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context({ idempotencyKey: key }),
    );
    const second = service.sellRefill(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context({ idempotencyKey: key }),
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.movementIds).toEqual(first.movementIds);
    expect(second.saleId).toBe(first.saleId);
    expect(service.sales.size).toBe(1);
    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill - 3,
    );
  });

  it("treats two different keys as two different sales", () => {
    const service = seeded();

    service.sellRefill(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context({ idempotencyKey: "MPESA-AAA" }),
    );
    service.sellRefill(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 3 },
      context({ idempotencyKey: "MPESA-BBB" }),
    );

    expect(service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill)).toBe(
      OPENING.afrigas13.refill - 6,
    );
    expect(service.sales.size).toBe(2);
  });

  it("replays a purchase the same way", () => {
    const service = seeded();
    const key = "DN-8841";

    service.purchase(
      { locationId: LOC.syokimau, variantId: VARIANT.total13, refills: 12 },
      context({ idempotencyKey: key }),
    );
    const replay = service.purchase(
      { locationId: LOC.syokimau, variantId: VARIANT.total13, refills: 12 },
      context({ idempotencyKey: key }),
    );

    expect(replay.replayed).toBe(true);
    expect(service.balance(LOC.syokimau, VARIANT.total13, GasState.Refill)).toBe(39);
  });
});

describe("audit trail", () => {
  it("keeps an unbroken before/after chain for every position", () => {
    const service = seeded();

    service.purchase(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, refills: 10 },
      context(),
    );
    service.sellRefill(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 7 },
      context(),
    );
    service.exchange(
      { locationId: LOC.syokimau, variantId: VARIANT.afrigas13, quantity: 2 },
      context(),
    );

    const rows = service
      .movements({ locationId: LOC.syokimau, variantId: VARIANT.afrigas13 })
      .filter((m) => m.ledgerKind === LedgerKind.Gas && m.state === GasState.Refill);

    let running = 0;
    for (const row of rows) {
      expect(row.balanceBefore).toBe(running);
      expect(row.balanceAfter).toBe(running + row.quantity);
      running = row.balanceAfter;
    }
    expect(running).toBe(
      service.balance(LOC.syokimau, VARIANT.afrigas13, GasState.Refill),
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it("assigns strictly increasing sequence numbers across both ledgers", () => {
    const service = seeded();
    service.purchase(
      {
        locationId: LOC.syokimau,
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
        locationId: LOC.syokimau,
        variantId: VARIANT.afrigas6,
        refills: 60,
        emptiesReturnedToDepot: 30,
      },
      context({ reference: "DN-9001" }),
    );
    service.sellMany(
      LOC.syokimau,
      [
        { variantId: VARIANT.afrigas6, quantity: 12, emptiesReceived: 9 },
        { variantId: VARIANT.afrigas13, quantity: 6, emptiesReceived: 6 },
        { variantId: VARIANT.total13, quantity: 2, emptiesReceived: 2 },
      ],
      context({ reference: "EOD-0510" }),
    );
    service.sellWithCylinder(
      { locationId: LOC.syokimau, variantId: VARIANT.total13, quantity: 2 },
      context(),
    );
    service.exchange(
      { locationId: LOC.kitengela, variantId: VARIANT.afrigas3, quantity: 5 },
      context(),
    );
    service.transfer(
      {
        fromLocationId: LOC.syokimau,
        toLocationId: LOC.kitengela,
        variantId: VARIANT.afrigas6,
        refills: 15,
        empties: 8,
      },
      context({ reference: "TRF-2001" }),
    );
    service.returnEmpty(
      {
        locationId: LOC.mlolongo,
        variantId: VARIANT.total13,
        quantity: 2,
        companyOwnedShell: true,
      },
      context(),
    );
    service.returnToDepot(
      { locationId: LOC.mlolongo, variantId: VARIANT.afrigas13, quantity: 5 },
      context(),
    );
    service.stocktake(
      {
        locationId: LOC.kitengela,
        variantId: VARIANT.afrigas3,
        state: GasState.Empty,
        countedQuantity: 12,
      },
      { actor: "Amina S.", reason: "Evening count, 3 kg cage" },
    );

    // The whole day rebuilds from the audit trail alone.
    expect(() => service.assertLedgerMatchesPositions()).not.toThrow();

    // Spot-check the arithmetic the ledgers should have produced.
    expect(service.balance(LOC.syokimau, VARIANT.afrigas6, GasState.Refill)).toBe(
      14 + 60 - 12 - 15,
    );
    expect(service.balance(LOC.syokimau, VARIANT.afrigas6, GasState.Empty)).toBe(
      36 - 30 + 9 - 8,
    );
    expect(service.balance(LOC.kitengela, VARIANT.afrigas6, GasState.Refill)).toBe(22);
    expect(service.balance(LOC.kitengela, VARIANT.afrigas6, GasState.Empty)).toBe(17);
    expect(service.balance(LOC.mlolongo, VARIANT.total13, GasState.Empty)).toBe(6);
    expect(service.balance(LOC.mlolongo, VARIANT.afrigas13, GasState.Empty)).toBe(3);
    expect(service.cylinders(LOC.syokimau, VARIANT.total13, Custody.Customer)).toBe(13);

    // Four tickets: the batch, the cylinder-left-out sale, the exchange, and
    // nothing for purchases, transfers, returns or stocktakes.
    expect(service.sales.size).toBe(3);
  });
});
