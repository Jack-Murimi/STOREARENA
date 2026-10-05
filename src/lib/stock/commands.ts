import type {
  Channel,
  CommandContext,
  OperationReceipt,
  ProductVariant,
  SaleLine,
  SalePricing,
  StockMovement,
  VariantPosition,
} from "./types";
import {
  Channel as ChannelValues,
  Custody,
  GasState,
  LedgerKind,
  LocationKind,
  Operation,
  StockModel,
} from "./types";
import { SaleLedger, buildSaleLine } from "./sales";
import type { LocationRegistry } from "./locations";
import type { Catalog } from "./catalog";
import { CylinderCustodyStore, GasInventoryStore } from "./stores";
import { MovementLedger } from "./ledger";
import type { MovementQuery } from "./ledger";
import { ChangeSet } from "./transaction";
import type { MovementMeta } from "./transaction";
import {
  InsufficientCylindersError,
  InsufficientStockError,
  InvalidQuantityError,
  InvalidActorError,
  InvalidReasonError,
  NotAtomicError,
  SameLocationTransferError,
  SizeMismatchError,
  StockError,
  StockErrorCode,
  UnsupportedStockModelError,
  BalanceMismatchError,
} from "./errors";
import { custodyKey, gasKey } from "./stores";

/* ------------------------------------------------------------------ inputs */

export interface PurchaseInput {
  locationId: string;
  variantId: string;
  /** Filled cylinders received. */
  refills: number;
  /** Company empties loaded back onto the depot truck. */
  emptiesReturnedToDepot?: number;
}

/** One line on a sale ticket. */
export interface RefillSaleLine {
  variantId: string;
  quantity: number;
  /**
   * Shells the customer handed over as part of this line. Defaults to 0 — a
   * plain refill sale moves gas only. Use `exchange` for the swap at the door.
   */
  emptiesReceived?: number;
  /** What was charged, and why if it is not list price. Defaults to list. */
  price?: SalePricing;
}

export interface RefillSaleInput extends RefillSaleLine {
  locationId: string;
}

/**
 * Gas sold in one of our cylinders that stays with the customer. Nothing extra
 * is charged for the cylinder and no deposit is held — the shell is simply
 * tracked as out with the customer until it comes back.
 */
export interface SellWithCylinderInput {
  locationId: string;
  variantId: string;
  quantity: number;
  price?: SalePricing;
  /**
   * When true (default) company custody moves BRANCH -> CUSTOMER. Set false for
   * a loan or demo cylinder that is expected back the same day.
   */
  transferCylinderOwnership?: boolean;
}

export interface ExchangeInput {
  locationId: string;
  /** Filled cylinder going out. */
  variantId: string;
  quantity: number;
  price?: SalePricing;
  /**
   * The shell coming in. Defaults to `variantId`.
   *
   * A different *brand* is fine — customers hand back whatever they have, and
   * the empty is booked against its own brand so it goes back to the right
   * depot. A different *size* is refused unless `allowSizeMismatch` is set,
   * because that is genuinely rare and worth a second look.
   */
  emptyVariantId?: string;
  allowSizeMismatch?: boolean;
}

export interface EmptyReturnInput {
  locationId: string;
  variantId: string;
  quantity: number;
  /**
   * True when the shell is one of ours coming back from a customer, which also
   * moves custody CUSTOMER -> BRANCH. False (default) for a customer-owned
   * shell left at the counter.
   */
  companyOwnedShell?: boolean;
}

export interface DepotReturnInput {
  locationId: string;
  variantId: string;
  quantity: number;
}

export interface TransferInput {
  fromLocationId: string;
  toLocationId: string;
  variantId: string;
  refills?: number;
  empties?: number;
}

export interface StocktakeInput {
  locationId: string;
  variantId: string;
  state: GasState;
  /** What was physically counted. */
  countedQuantity: number;
}

export interface CustodyAdjustmentInput {
  locationId: string;
  variantId: string;
  custody: Custody;
  countedQuantity: number;
}

/* ----------------------------------------------------------------- service */

const DEFAULT_REASONS: Record<Operation, string> = {
  [Operation.Purchase]: "Received from depot",
  [Operation.RefillSale]: "Refill sale over the counter",
  [Operation.NewCylinderSale]: "New cylinder sale",
  [Operation.Exchange]: "Cylinder exchange",
  [Operation.EmptyReturn]: "Empty returned at counter",
  [Operation.DepotReturn]: "Empties returned to depot",
  [Operation.Transfer]: "Inter-branch transfer",
  [Operation.Stocktake]: "Stocktake correction",
};

const MIN_REASON_LENGTH = 5;

/**
 * The stock service. Every public method is atomic: it validates the whole
 * operation against projected balances, then commits every ledger row at once.
 */
export class StockService {
  readonly inventory = new GasInventoryStore();
  readonly custody = new CylinderCustodyStore();
  readonly ledger = new MovementLedger();
  readonly sales = new SaleLedger();
  private readonly receipts = new Map<string, OperationReceipt>();

  constructor(
    readonly catalog: Catalog,
    readonly locations: LocationRegistry,
  ) {}

  /* ---------------------------------------------------------------- reads */

  balance(locationId: string, variantId: string, state: GasState): number {
    return this.inventory.balance(locationId, variantId, state);
  }

  cylinders(locationId: string, variantId: string, custody: Custody): number {
    return this.custody.balance(locationId, variantId, custody);
  }

  position(locationId: string, variantId: string): VariantPosition {
    return {
      locationId,
      variantId,
      refill: this.balance(locationId, variantId, GasState.Refill),
      empty: this.balance(locationId, variantId, GasState.Empty),
      cylinders:
        this.balance(locationId, variantId, GasState.Refill) +
        this.balance(locationId, variantId, GasState.Empty),
      companyShellsOnSite: this.custody.balance(
        locationId,
        variantId,
        Custody.Branch,
      ),
    };
  }

  positions(locationId: string): VariantPosition[] {
    const variantIds = new Set(
      this.inventory
        .entries()
        .filter((e) => e.locationId === locationId)
        .map((e) => e.variantId),
    );
    return [...variantIds].map((variantId) => this.position(locationId, variantId));
  }

  /** Kilograms of gas in filled cylinders, optionally filtered by variant. */
  gasKg(locationId: string, variantId?: string): number {
    return this.catalog
      .listVariants()
      .filter(
        (v) =>
          v.sizeKg !== null &&
          (variantId === undefined || v.id === variantId),
      )
      .reduce(
        (total, v) =>
          total + this.balance(locationId, v.id, GasState.Refill) * (v.sizeKg ?? 0),
        0,
      );
  }

  /** Physical cylinders standing at a location: filled plus empty. */
  cylinderCount(locationId: string, variantId: string): number {
    return (
      this.balance(locationId, variantId, GasState.Refill) +
      this.balance(locationId, variantId, GasState.Empty)
    );
  }

  /** Value of filled stock at standard list prices. */
  listValueKsh(locationId: string): number {
    return this.catalog.listVariants().reduce(
      (total, v) =>
        total +
        this.balance(locationId, v.id, GasState.Refill) * (v.listPriceKsh ?? 0),
      0,
    );
  }

  movements(query: MovementQuery = {}): StockMovement[] {
    return this.ledger.query(query);
  }

  /* ------------------------------------------------------------- commands */

  /** Filled cylinders in from the brand depot; company empties back out. */
  purchase(input: PurchaseInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.locations.requireActive(input.locationId);
    const variant = this.requireCylinderVariant(input.variantId);
    const refills = this.wholeNumber("refills", input.refills, 1);
    const empties = this.wholeNumber(
      "emptiesReturnedToDepot",
      input.emptiesReturnedToDepot ?? 0,
      0,
    );

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.Purchase, input.locationId, variant);

    this.requireGas(changes, input.locationId, variant, GasState.Empty, empties);
    this.requireCustody(changes, input.locationId, variant, Custody.Branch, empties);

    changes.addGas(input.locationId, variant.id, GasState.Refill, refills, meta);
    changes.addGas(input.locationId, variant.id, GasState.Empty, -empties, meta);
    changes.addCustody(
      input.locationId,
      variant.id,
      Custody.Branch,
      refills - empties,
      meta,
    );
    changes.addCustody(input.locationId, variant.id, Custody.Depot, empties, meta);

    return this.commit(changes, Operation.Purchase, ctx);
  }

  /** Gas sold into the customer's own cylinder. Moves gas stock only. */
  sellRefill(input: RefillSaleInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.locations.requireActive(input.locationId);
    const variant = this.requireCylinderVariant(input.variantId);
    const line = buildSaleLine(variant, input.quantity, input.price ?? {});
    const quantity = this.wholeNumber("quantity", input.quantity, 1);
    const emptiesReceived = this.wholeNumber(
      "emptiesReceived",
      input.emptiesReceived ?? 0,
      0,
    );
    if (emptiesReceived > quantity) {
      throw new InvalidQuantityError(
        "emptiesReceived",
        emptiesReceived,
        `cannot exceed quantity (${quantity})`,
      );
    }

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.RefillSale, input.locationId, variant);

    this.requireGas(changes, input.locationId, variant, GasState.Refill, quantity);
    changes.addGas(input.locationId, variant.id, GasState.Refill, -quantity, meta);
    changes.addGas(input.locationId, variant.id, GasState.Empty, emptiesReceived, meta);

    return this.commitSale(changes, Operation.RefillSale, ctx, input.locationId, [line]);
  }

  /**
   * Gas sold in one of our cylinders that leaves with the customer. This is the
   * operation that must touch both ledgers: gas goes down and custody moves
   * BRANCH -> CUSTOMER.
   */
  sellWithCylinder(
    input: SellWithCylinderInput,
    ctx: CommandContext,
  ): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.locations.requireActive(input.locationId);
    const variant = this.requireCylinderVariant(input.variantId);
    const line = buildSaleLine(variant, input.quantity, input.price ?? {});
    const quantity = this.wholeNumber("quantity", input.quantity, 1);
    const transferOwnership = input.transferCylinderOwnership ?? true;

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(
      ctx,
      Operation.NewCylinderSale,
      input.locationId,
      variant,
    );

    this.requireGas(changes, input.locationId, variant, GasState.Refill, quantity);
    if (transferOwnership) {
      this.requireCustody(
        changes,
        input.locationId,
        variant,
        Custody.Branch,
        quantity,
      );
    }

    changes.addGas(input.locationId, variant.id, GasState.Refill, -quantity, meta);
    if (transferOwnership) {
      changes.addCustody(
        input.locationId,
        variant.id,
        Custody.Branch,
        -quantity,
        meta,
      );
      changes.addCustody(
        input.locationId,
        variant.id,
        Custody.Customer,
        quantity,
        meta,
      );
    }

    return this.commitSale(
      changes,
      Operation.NewCylinderSale,
      ctx,
      input.locationId,
      [line],
    );
  }

  /**
   * The everyday sale: a filled cylinder goes out, the customer's empty comes
   * in. The empty may be a different brand — it is booked against its own brand
   * so it travels back to the right depot.
   */
  exchange(input: ExchangeInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.locations.requireActive(input.locationId);
    const out = this.requireCylinderVariant(input.variantId);
    const incoming = input.emptyVariantId
      ? this.requireCylinderVariant(input.emptyVariantId)
      : out;
    const quantity = this.wholeNumber("quantity", input.quantity, 1);
    const line = buildSaleLine(out, quantity, input.price ?? {});

    if (incoming.sizeKg !== out.sizeKg && !input.allowSizeMismatch) {
      throw new SizeMismatchError(out.name, incoming.name);
    }

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.Exchange, input.locationId, out);

    this.requireGas(changes, input.locationId, out, GasState.Refill, quantity);
    changes.addGas(input.locationId, out.id, GasState.Refill, -quantity, meta);
    changes.addGas(input.locationId, incoming.id, GasState.Empty, quantity, meta);

    return this.commitSale(changes, Operation.Exchange, ctx, input.locationId, [line]);
  }

  /** A shell handed back at the counter. Increases EMPTY for that variant only. */
  returnEmpty(input: EmptyReturnInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.locations.requireActive(input.locationId);
    const variant = this.requireCylinderVariant(input.variantId);
    const quantity = this.wholeNumber("quantity", input.quantity, 1);

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.EmptyReturn, input.locationId, variant);

    changes.addGas(input.locationId, variant.id, GasState.Empty, quantity, meta);

    if (input.companyOwnedShell) {
      this.requireCustody(
        changes,
        input.locationId,
        variant,
        Custody.Customer,
        quantity,
      );
      changes.addCustody(
        input.locationId,
        variant.id,
        Custody.Customer,
        -quantity,
        meta,
      );
      changes.addCustody(
        input.locationId,
        variant.id,
        Custody.Branch,
        quantity,
        meta,
      );
    }

    return this.commit(changes, Operation.EmptyReturn, ctx);
  }

  /** Company empties loaded onto the depot truck. */
  returnToDepot(input: DepotReturnInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.locations.requireActive(input.locationId);
    const variant = this.requireCylinderVariant(input.variantId);
    const quantity = this.wholeNumber("quantity", input.quantity, 1);

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.DepotReturn, input.locationId, variant);

    this.requireGas(changes, input.locationId, variant, GasState.Empty, quantity);
    this.requireCustody(changes, input.locationId, variant, Custody.Branch, quantity);

    changes.addGas(input.locationId, variant.id, GasState.Empty, -quantity, meta);
    changes.addCustody(
      input.locationId,
      variant.id,
      Custody.Branch,
      -quantity,
      meta,
    );
    changes.addCustody(input.locationId, variant.id, Custody.Depot, quantity, meta);

    return this.commit(changes, Operation.DepotReturn, ctx);
  }

  /** Stock moved between Gateway branches. Atomic across both ends. */
  transfer(input: TransferInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    if (input.fromLocationId === input.toLocationId) {
      throw new SameLocationTransferError(input.fromLocationId);
    }
    this.locations.requireActive(input.fromLocationId);
    this.locations.requireActive(input.toLocationId);
    const variant = this.requireCylinderVariant(input.variantId);

    const refills = this.wholeNumber("refills", input.refills ?? 0, 0);
    const empties = this.wholeNumber("empties", input.empties ?? 0, 0);
    if (refills + empties === 0) {
      throw new InvalidQuantityError(
        "refills+empties",
        0,
        "a transfer must move at least one cylinder",
      );
    }

    const changes = new ChangeSet(this.inventory, this.custody);
    const shells = refills + empties;

    const fromMeta = this.metaFor(
      ctx,
      Operation.Transfer,
      input.fromLocationId,
      variant,
      undefined,
      input.toLocationId,
    );
    const toMeta = this.metaFor(
      ctx,
      Operation.Transfer,
      input.toLocationId,
      variant,
      undefined,
      input.fromLocationId,
    );

    this.requireGas(changes, input.fromLocationId, variant, GasState.Refill, refills);
    this.requireGas(changes, input.fromLocationId, variant, GasState.Empty, empties);
    this.requireCustody(
      changes,
      input.fromLocationId,
      variant,
      Custody.Branch,
      shells,
    );

    changes.addGas(input.fromLocationId, variant.id, GasState.Refill, -refills, fromMeta);
    changes.addGas(input.fromLocationId, variant.id, GasState.Empty, -empties, fromMeta);
    changes.addGas(input.toLocationId, variant.id, GasState.Refill, refills, toMeta);
    changes.addGas(input.toLocationId, variant.id, GasState.Empty, empties, toMeta);
    changes.addCustody(
      input.fromLocationId,
      variant.id,
      Custody.Branch,
      -shells,
      fromMeta,
    );
    changes.addCustody(
      input.toLocationId,
      variant.id,
      Custody.Branch,
      shells,
      toMeta,
    );

    return this.commit(changes, Operation.Transfer, ctx);
  }

  /** Counted correction. Always requires a reason worth reading later. */
  stocktake(input: StocktakeInput, ctx: CommandContext): OperationReceipt {
    return this.stocktakeMany([input], ctx);
  }

  /** Several counted corrections in one atomic batch. */
  stocktakeMany(
    lines: StocktakeInput[],
    ctx: CommandContext,
  ): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    const reason = this.requireReason(ctx.reason);
    if (lines.length === 0) {
      throw new InvalidQuantityError("lines", 0, "at least one line is required");
    }

    const changes = new ChangeSet(this.inventory, this.custody);
    try {
      for (const line of lines) {
        this.locations.requireActive(line.locationId);
        const variant = this.requireCylinderVariant(line.variantId);
        const counted = this.wholeNumber("countedQuantity", line.countedQuantity, 0);
        const meta = this.metaFor(
          ctx,
          Operation.Stocktake,
          line.locationId,
          variant,
          reason,
        );
        const current = changes.projectedGas(line.locationId, variant.id, line.state);
        changes.addGas(
          line.locationId,
          variant.id,
          line.state,
          counted - current,
          meta,
          { keepZero: true },
        );
      }
    } catch (error) {
      this.failBatch("stocktake", changes, error);
    }

    return this.commit(changes, Operation.Stocktake, ctx);
  }

  /**
   * Sets company cylinder counts — used for opening balances after a cylinder
   * audit, and for correcting the asset register without touching gas stock.
   */
  adjustCustody(
    lines: CustodyAdjustmentInput[],
    ctx: CommandContext,
  ): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    const reason = this.requireReason(ctx.reason);
    if (lines.length === 0) {
      throw new InvalidQuantityError("lines", 0, "at least one line is required");
    }

    const changes = new ChangeSet(this.inventory, this.custody);
    try {
      for (const line of lines) {
        this.locations.requireActive(line.locationId);
        const variant = this.requireCylinderVariant(line.variantId);
        const counted = this.wholeNumber("countedQuantity", line.countedQuantity, 0);
        const meta = this.metaFor(
          ctx,
          Operation.Stocktake,
          line.locationId,
          variant,
          reason,
        );
        const current = changes.projectedCustody(
          line.locationId,
          variant.id,
          line.custody,
        );
        changes.addCustody(
          line.locationId,
          variant.id,
          line.custody,
          counted - current,
          meta,
          { keepZero: true },
        );
      }
    } catch (error) {
      this.failBatch("adjustCustody", changes, error);
    }

    return this.commit(changes, Operation.Stocktake, ctx);
  }

  /**
   * A queue of counter sales committed together — the "end of shift, post the
   * day's tickets" case. If any line is invalid, none of them are written.
   */
  /**
   * A queue of counter tickets posted together — the rider's end-of-shift
   * reconciliation, or a busy hour at the counter. One location, one ticket
   * record, and if any line is wrong then none of them are written.
   */
  sellMany(
    locationId: string,
    lines: RefillSaleLine[],
    ctx: CommandContext,
  ): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.locations.requireActive(locationId);
    if (lines.length === 0) {
      throw new InvalidQuantityError("lines", 0, "at least one line is required");
    }

    // Validate every line, including its price, before touching stock.
    const saleLines: SaleLine[] = [];
    const resolved = lines.map((line) => {
      const variant = this.requireCylinderVariant(line.variantId);
      const quantity = this.wholeNumber("quantity", line.quantity, 1);
      const emptiesReceived = this.wholeNumber(
        "emptiesReceived",
        line.emptiesReceived ?? 0,
        0,
      );
      if (emptiesReceived > quantity) {
        throw new InvalidQuantityError(
          "emptiesReceived",
          emptiesReceived,
          `cannot exceed quantity (${quantity})`,
        );
      }
      saleLines.push(buildSaleLine(variant, quantity, line.price ?? {}));
      return { variant, quantity, emptiesReceived };
    });

    const changes = new ChangeSet(this.inventory, this.custody);
    try {
      for (const { variant, quantity, emptiesReceived } of resolved) {
        const meta = this.metaFor(ctx, Operation.RefillSale, locationId, variant);
        this.requireGas(changes, locationId, variant, GasState.Refill, quantity);
        changes.addGas(locationId, variant.id, GasState.Refill, -quantity, meta);
        changes.addGas(locationId, variant.id, GasState.Empty, emptiesReceived, meta);
      }
    } catch (error) {
      this.failBatch("sellMany", changes, error);
    }

    return this.commitSale(changes, Operation.RefillSale, ctx, locationId, saleLines);
  }

  /* ------------------------------------------------------------ integrity */

  /**
   * Rebuilds both ledgers from the audit trail and compares them to the live
   * balances. Any difference means a bug in an operation, not bad data.
   */
  assertLedgerMatchesPositions(): void {
    const expectedGas = this.ledger.replayBalances();
    for (const entry of this.inventory.entries()) {
      const key = gasKey(entry.locationId, entry.variantId, entry.state);
      const fromLedger = expectedGas.get(key) ?? 0;
      if (fromLedger !== entry.quantity) {
        throw new BalanceMismatchError(key, fromLedger, entry.quantity);
      }
      expectedGas.delete(key);
    }
    for (const [key, quantity] of expectedGas) {
      if (quantity !== 0) throw new BalanceMismatchError(key, quantity, 0);
    }

    const expectedCustody = this.ledger.replayCustodyBalances();
    for (const entry of this.custody.entries()) {
      const key = custodyKey(entry.locationId, entry.variantId, entry.custody);
      const fromLedger = expectedCustody.get(key) ?? 0;
      if (fromLedger !== entry.quantity) {
        throw new BalanceMismatchError(key, fromLedger, entry.quantity);
      }
      expectedCustody.delete(key);
    }
    for (const [key, quantity] of expectedCustody) {
      if (quantity !== 0) throw new BalanceMismatchError(key, quantity, 0);
    }
  }

  /* -------------------------------------------------------------- helpers */

  /**
   * Commits the stock movements and then writes the sale ticket. Pricing is
   * validated long before this point, so nothing here can fail after the stock
   * has moved.
   */
  private commitSale(
    changes: ChangeSet,
    operation: Operation,
    ctx: CommandContext,
    locationId: string,
    lines: SaleLine[],
  ): OperationReceipt {
    const receipt = this.commit(changes, operation, ctx);
    const listTotalKsh = lines.reduce((sum, l) => sum + l.listTotalKsh, 0);
    const chargedTotalKsh = lines.reduce((sum, l) => sum + l.chargedTotalKsh, 0);

    const sale = this.sales.append({
      locationId,
      channel: ctx.channel ?? this.defaultChannel(locationId),
      operation,
      occurredAt: (ctx.occurredAt ?? new Date()).toISOString(),
      actor: ctx.actor,
      customer: ctx.customer ?? null,
      reference: ctx.reference ?? null,
      idempotencyKey: ctx.idempotencyKey ?? null,
      lines,
      listTotalKsh,
      chargedTotalKsh,
      discountKsh: listTotalKsh - chargedTotalKsh,
    });

    const withSale: OperationReceipt = { ...receipt, saleId: sale.id };
    if (ctx.idempotencyKey) this.receipts.set(ctx.idempotencyKey, withSale);
    return withSale;
  }

  /** Sales at a branch are walk-ins; sales from a van are deliveries. */
  private defaultChannel(locationId: string): Channel {
    return this.locations.require(locationId).kind === LocationKind.Van
      ? ChannelValues.Delivery
      : ChannelValues.WalkIn;
  }

  private replayOf(ctx: CommandContext): OperationReceipt | null {
    if (!ctx.idempotencyKey) return null;
    const existing = this.receipts.get(ctx.idempotencyKey);
    return existing ? { ...existing, replayed: true } : null;
  }

  private requireCylinderVariant(variantId: string): ProductVariant {
    const variant = this.catalog.requireVariant(variantId);
    const category = this.catalog.requireCategory(variant.categoryId);
    if (category.stockModel !== StockModel.Cylinder) {
      throw new UnsupportedStockModelError(variant.id, category.stockModel);
    }
    if (!variant.active) {
      throw new StockError(
        StockErrorCode.InactiveVariant,
        `Variant is discontinued: ${variant.id}`,
        { variantId: variant.id },
      );
    }
    return variant;
  }

  private wholeNumber(field: string, value: number, min: number): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new InvalidQuantityError(field, value, "must be a number");
    }
    if (!Number.isInteger(value)) {
      throw new InvalidQuantityError(field, value, "must be a whole number");
    }
    if (value < min) {
      throw new InvalidQuantityError(field, value, `must be at least ${min}`);
    }
    return value;
  }

  private requireReason(reason: string | undefined): string {
    const trimmed = (reason ?? "").trim();
    if (trimmed.length < MIN_REASON_LENGTH) throw new InvalidReasonError(reason);
    return trimmed;
  }

  private metaFor(
    ctx: CommandContext,
    operation: Operation,
    locationId: string,
    variant: ProductVariant,
    reason?: string,
    counterpartyLocationId?: string,
  ): MovementMeta {
    const actor = (ctx.actor ?? "").trim();
    if (actor.length < 2) throw new InvalidActorError(ctx.actor);
    return {
      operation,
      locationId,
      counterpartyLocationId: counterpartyLocationId ?? null,
      variantId: variant.id,
      reason: reason?.trim() || ctx.reason?.trim() || DEFAULT_REASONS[operation],
      reference: ctx.reference ?? null,
      actor: ctx.actor,
      idempotencyKey: ctx.idempotencyKey ?? null,
      occurredAt: ctx.occurredAt ?? new Date(),
    };
  }

  private requireGas(
    changes: ChangeSet,
    locationId: string,
    variant: ProductVariant,
    state: GasState,
    quantity: number,
  ): void {
    if (quantity <= 0) return;
    const available = changes.projectedGas(locationId, variant.id, state);
    if (available < quantity) {
      throw new InsufficientStockError(
        locationId,
        variant.id,
        state,
        quantity,
        available,
      );
    }
  }

  private requireCustody(
    changes: ChangeSet,
    locationId: string,
    variant: ProductVariant,
    custody: Custody,
    quantity: number,
  ): void {
    if (quantity <= 0) return;
    const available = changes.projectedCustody(locationId, variant.id, custody);
    if (available < quantity) {
      throw new InsufficientCylindersError(
        locationId,
        variant.id,
        custody,
        quantity,
        available,
      );
    }
  }

  /**
   * A batch that failed with nothing staged has nothing to roll back, so the
   * caller gets the real error (bad variant, bad quantity) rather than a
   * rollback wrapper that tells them nothing.
   */
  private failBatch(operation: string, changes: ChangeSet, error: unknown): never {
    if (error instanceof StockError && !changes.isEmpty) {
      throw new NotAtomicError(operation, error);
    }
    throw error;
  }

  private commit(
    changes: ChangeSet,
    operation: Operation,
    ctx: CommandContext,
  ): OperationReceipt {
    const movementIds: string[] = [];
    for (const { delta, meta } of changes.staged) {
      if (delta.ledgerKind === LedgerKind.Gas) {
        const { before, after } = this.inventory.add(
          delta.locationId,
          delta.variantId,
          delta.state,
          delta.quantity,
        );
        movementIds.push(
          this.ledger.append({
            ledgerKind: LedgerKind.Gas,
            operation: meta.operation,
            occurredAt: meta.occurredAt.toISOString(),
            locationId: delta.locationId,
            counterpartyLocationId: meta.counterpartyLocationId ?? null,
            variantId: delta.variantId,
            state: delta.state,
            custody: null,
            quantity: delta.quantity,
            balanceBefore: before,
            balanceAfter: after,
            reason: meta.reason,
            reference: meta.reference ?? null,
            actor: meta.actor,
            idempotencyKey: meta.idempotencyKey ?? null,
          }).id,
        );
      } else {
        const { before, after } = this.custody.add(
          delta.locationId,
          delta.variantId,
          delta.custody,
          delta.quantity,
        );
        movementIds.push(
          this.ledger.append({
            ledgerKind: LedgerKind.Cylinder,
            operation: meta.operation,
            occurredAt: meta.occurredAt.toISOString(),
            locationId: delta.locationId,
            counterpartyLocationId: meta.counterpartyLocationId ?? null,
            variantId: delta.variantId,
            state: null,
            custody: delta.custody,
            quantity: delta.quantity,
            balanceBefore: before,
            balanceAfter: after,
            reason: meta.reason,
            reference: meta.reference ?? null,
            actor: meta.actor,
            idempotencyKey: meta.idempotencyKey ?? null,
          }).id,
        );
      }
    }

    const receipt: OperationReceipt = {
      operation,
      idempotencyKey: ctx.idempotencyKey ?? null,
      committedAt: new Date().toISOString(),
      movementIds,
      deltas: changes.staged.map((item) => item.delta),
      saleId: null,
      replayed: false,
    };
    if (ctx.idempotencyKey) {
      this.receipts.set(ctx.idempotencyKey, receipt);
    }
    return receipt;
  }
}
