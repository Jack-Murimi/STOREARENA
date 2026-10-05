import type {
  CommandContext,
  OperationReceipt,
  ProductVariant,
  StockMovement,
  VariantPosition,
} from "./types";
import { Custody, GasState, LedgerKind, Operation, StockModel } from "./types";
import type { BranchRegistry } from "./branches";
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
  InvalidReasonError,
  NotAtomicError,
  SameBranchTransferError,
  SizeMismatchError,
  StockError,
  StockErrorCode,
  UnsupportedStockModelError,
  BrandMismatchError,
  BalanceMismatchError,
} from "./errors";
import { custodyKey, gasKey } from "./stores";

/* ------------------------------------------------------------------ inputs */

export interface PurchaseInput {
  branchId: string;
  variantId: string;
  /** Filled cylinders received. */
  refills: number;
  /** Company empties loaded back onto the depot truck. */
  emptiesReturnedToDepot?: number;
}

export interface RefillSaleInput {
  branchId: string;
  variantId: string;
  quantity: number;
  /**
   * Shells the customer handed over as part of this sale. Defaults to 0 — a
   * plain refill sale moves gas only. Use `exchange` for a like-for-like swap.
   */
  emptiesReceived?: number;
}

export interface NewCylinderSaleInput {
  branchId: string;
  variantId: string;
  quantity: number;
  /**
   * When true (default) the cylinder leaves with the customer and company
   * custody moves BRANCH -> CUSTOMER. Set false for a loan/demo cylinder that
   * is expected back.
   */
  transferCylinderOwnership?: boolean;
}

export interface ExchangeInput {
  branchId: string;
  /** Filled cylinder going out. */
  variantId: string;
  quantity: number;
  /** Shell coming in. Defaults to `variantId`. Must be the same brand. */
  emptyVariantId?: string;
  /** Allow e.g. a 6 kg shell back against a 13 kg refill. Off by default. */
  allowSizeMismatch?: boolean;
}

export interface EmptyReturnInput {
  branchId: string;
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
  branchId: string;
  variantId: string;
  quantity: number;
}

export interface TransferInput {
  fromBranchId: string;
  toBranchId: string;
  variantId: string;
  refills?: number;
  empties?: number;
}

export interface StocktakeInput {
  branchId: string;
  variantId: string;
  state: GasState;
  /** What was physically counted. */
  countedQuantity: number;
}

export interface CustodyAdjustmentInput {
  branchId: string;
  variantId: string;
  custody: Custody;
  countedQuantity: number;
}

export interface RefillSaleLine {
  branchId: string;
  variantId: string;
  quantity: number;
  emptiesReceived?: number;
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
  private readonly receipts = new Map<string, OperationReceipt>();

  constructor(
    readonly catalog: Catalog,
    readonly branches: BranchRegistry,
  ) {}

  /* ---------------------------------------------------------------- reads */

  balance(branchId: string, variantId: string, state: GasState): number {
    return this.inventory.balance(branchId, variantId, state);
  }

  cylinders(branchId: string, variantId: string, custody: Custody): number {
    return this.custody.balance(branchId, variantId, custody);
  }

  position(branchId: string, variantId: string): VariantPosition {
    return {
      branchId,
      variantId,
      refill: this.balance(branchId, variantId, GasState.Refill),
      empty: this.balance(branchId, variantId, GasState.Empty),
      companyShellsAtBranch: this.custody.balance(
        branchId,
        variantId,
        Custody.Branch,
      ),
    };
  }

  positions(branchId: string): VariantPosition[] {
    const variantIds = new Set(
      this.inventory
        .entries()
        .filter((e) => e.branchId === branchId)
        .map((e) => e.variantId),
    );
    return [...variantIds].map((variantId) => this.position(branchId, variantId));
  }

  /** Kilograms of gas in filled cylinders, optionally filtered by variant. */
  gasKg(branchId: string, variantId?: string): number {
    return this.catalog
      .listVariants()
      .filter(
        (v) =>
          v.sizeKg !== null &&
          (variantId === undefined || v.id === variantId),
      )
      .reduce(
        (total, v) =>
          total + this.balance(branchId, v.id, GasState.Refill) * (v.sizeKg ?? 0),
        0,
      );
  }

  /** Retail value of filled stock, using the variant's refill price. */
  retailValueKsh(branchId: string): number {
    return this.catalog.listVariants().reduce(
      (total, v) =>
        total +
        this.balance(branchId, v.id, GasState.Refill) * (v.refillPriceKsh ?? 0),
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

    this.branches.requireActive(input.branchId);
    const variant = this.requireCylinderVariant(input.variantId);
    const refills = this.wholeNumber("refills", input.refills, 1);
    const empties = this.wholeNumber(
      "emptiesReturnedToDepot",
      input.emptiesReturnedToDepot ?? 0,
      0,
    );

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.Purchase, input.branchId, variant);

    this.requireGas(changes, input.branchId, variant, GasState.Empty, empties);
    this.requireCustody(changes, input.branchId, variant, Custody.Branch, empties);

    changes.addGas(input.branchId, variant.id, GasState.Refill, refills, meta);
    changes.addGas(input.branchId, variant.id, GasState.Empty, -empties, meta);
    changes.addCustody(
      input.branchId,
      variant.id,
      Custody.Branch,
      refills - empties,
      meta,
    );
    changes.addCustody(input.branchId, variant.id, Custody.Depot, empties, meta);

    return this.commit(changes, Operation.Purchase, ctx);
  }

  /** Gas sold into the customer's own cylinder. Moves gas stock only. */
  sellRefill(input: RefillSaleInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.branches.requireActive(input.branchId);
    const variant = this.requireCylinderVariant(input.variantId);
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
    const meta = this.metaFor(ctx, Operation.RefillSale, input.branchId, variant);

    this.requireGas(changes, input.branchId, variant, GasState.Refill, quantity);
    changes.addGas(input.branchId, variant.id, GasState.Refill, -quantity, meta);
    changes.addGas(input.branchId, variant.id, GasState.Empty, emptiesReceived, meta);

    return this.commit(changes, Operation.RefillSale, ctx);
  }

  /**
   * Gas sold in one of our cylinders that leaves with the customer. This is the
   * operation that must touch both ledgers: gas goes down and custody moves
   * BRANCH -> CUSTOMER.
   */
  sellNewCylinder(
    input: NewCylinderSaleInput,
    ctx: CommandContext,
  ): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.branches.requireActive(input.branchId);
    const variant = this.requireCylinderVariant(input.variantId);
    const quantity = this.wholeNumber("quantity", input.quantity, 1);
    const transferOwnership = input.transferCylinderOwnership ?? true;

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(
      ctx,
      Operation.NewCylinderSale,
      input.branchId,
      variant,
    );

    this.requireGas(changes, input.branchId, variant, GasState.Refill, quantity);
    if (transferOwnership) {
      this.requireCustody(
        changes,
        input.branchId,
        variant,
        Custody.Branch,
        quantity,
      );
    }

    changes.addGas(input.branchId, variant.id, GasState.Refill, -quantity, meta);
    if (transferOwnership) {
      changes.addCustody(
        input.branchId,
        variant.id,
        Custody.Branch,
        -quantity,
        meta,
      );
      changes.addCustody(
        input.branchId,
        variant.id,
        Custody.Customer,
        quantity,
        meta,
      );
    }

    return this.commit(changes, Operation.NewCylinderSale, ctx);
  }

  /** Like-for-like swap: filled out, shell in. Same brand, always. */
  exchange(input: ExchangeInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.branches.requireActive(input.branchId);
    const out = this.requireCylinderVariant(input.variantId);
    const incoming = input.emptyVariantId
      ? this.requireCylinderVariant(input.emptyVariantId)
      : out;
    const quantity = this.wholeNumber("quantity", input.quantity, 1);

    const outBrand = this.catalog.requireBrand(out.brandId);
    const inBrand = this.catalog.requireBrand(incoming.brandId);
    if (outBrand.id !== inBrand.id) {
      throw new BrandMismatchError(outBrand.name, inBrand.name);
    }
    if (incoming.id !== out.id && !input.allowSizeMismatch) {
      throw new SizeMismatchError(out.name, incoming.name);
    }

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.Exchange, input.branchId, out);

    this.requireGas(changes, input.branchId, out, GasState.Refill, quantity);
    changes.addGas(input.branchId, out.id, GasState.Refill, -quantity, meta);
    changes.addGas(input.branchId, incoming.id, GasState.Empty, quantity, meta);

    return this.commit(changes, Operation.Exchange, ctx);
  }

  /** A shell handed back at the counter. Increases EMPTY for that variant only. */
  returnEmpty(input: EmptyReturnInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    this.branches.requireActive(input.branchId);
    const variant = this.requireCylinderVariant(input.variantId);
    const quantity = this.wholeNumber("quantity", input.quantity, 1);

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.EmptyReturn, input.branchId, variant);

    changes.addGas(input.branchId, variant.id, GasState.Empty, quantity, meta);

    if (input.companyOwnedShell) {
      this.requireCustody(
        changes,
        input.branchId,
        variant,
        Custody.Customer,
        quantity,
      );
      changes.addCustody(
        input.branchId,
        variant.id,
        Custody.Customer,
        -quantity,
        meta,
      );
      changes.addCustody(
        input.branchId,
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

    this.branches.requireActive(input.branchId);
    const variant = this.requireCylinderVariant(input.variantId);
    const quantity = this.wholeNumber("quantity", input.quantity, 1);

    const changes = new ChangeSet(this.inventory, this.custody);
    const meta = this.metaFor(ctx, Operation.DepotReturn, input.branchId, variant);

    this.requireGas(changes, input.branchId, variant, GasState.Empty, quantity);
    this.requireCustody(changes, input.branchId, variant, Custody.Branch, quantity);

    changes.addGas(input.branchId, variant.id, GasState.Empty, -quantity, meta);
    changes.addCustody(
      input.branchId,
      variant.id,
      Custody.Branch,
      -quantity,
      meta,
    );
    changes.addCustody(input.branchId, variant.id, Custody.Depot, quantity, meta);

    return this.commit(changes, Operation.DepotReturn, ctx);
  }

  /** Stock moved between Gateway branches. Atomic across both ends. */
  transfer(input: TransferInput, ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    if (input.fromBranchId === input.toBranchId) {
      throw new SameBranchTransferError(input.fromBranchId);
    }
    this.branches.requireActive(input.fromBranchId);
    this.branches.requireActive(input.toBranchId);
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
      input.fromBranchId,
      variant,
      undefined,
      input.toBranchId,
    );
    const toMeta = this.metaFor(
      ctx,
      Operation.Transfer,
      input.toBranchId,
      variant,
      undefined,
      input.fromBranchId,
    );

    this.requireGas(changes, input.fromBranchId, variant, GasState.Refill, refills);
    this.requireGas(changes, input.fromBranchId, variant, GasState.Empty, empties);
    this.requireCustody(
      changes,
      input.fromBranchId,
      variant,
      Custody.Branch,
      shells,
    );

    changes.addGas(input.fromBranchId, variant.id, GasState.Refill, -refills, fromMeta);
    changes.addGas(input.fromBranchId, variant.id, GasState.Empty, -empties, fromMeta);
    changes.addGas(input.toBranchId, variant.id, GasState.Refill, refills, toMeta);
    changes.addGas(input.toBranchId, variant.id, GasState.Empty, empties, toMeta);
    changes.addCustody(
      input.fromBranchId,
      variant.id,
      Custody.Branch,
      -shells,
      fromMeta,
    );
    changes.addCustody(
      input.toBranchId,
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
        this.branches.requireActive(line.branchId);
        const variant = this.requireCylinderVariant(line.variantId);
        const counted = this.wholeNumber("countedQuantity", line.countedQuantity, 0);
        const meta = this.metaFor(
          ctx,
          Operation.Stocktake,
          line.branchId,
          variant,
          reason,
        );
        const current = changes.projectedGas(line.branchId, variant.id, line.state);
        changes.addGas(
          line.branchId,
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
        this.branches.requireActive(line.branchId);
        const variant = this.requireCylinderVariant(line.variantId);
        const counted = this.wholeNumber("countedQuantity", line.countedQuantity, 0);
        const meta = this.metaFor(
          ctx,
          Operation.Stocktake,
          line.branchId,
          variant,
          reason,
        );
        const current = changes.projectedCustody(
          line.branchId,
          variant.id,
          line.custody,
        );
        changes.addCustody(
          line.branchId,
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
  sellMany(lines: RefillSaleLine[], ctx: CommandContext): OperationReceipt {
    const replayed = this.replayOf(ctx);
    if (replayed) return replayed;

    if (lines.length === 0) {
      throw new InvalidQuantityError("lines", 0, "at least one line is required");
    }

    const changes = new ChangeSet(this.inventory, this.custody);
    try {
      for (const line of lines) {
        this.branches.requireActive(line.branchId);
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
        const meta = this.metaFor(
          ctx,
          Operation.RefillSale,
          line.branchId,
          variant,
        );
        this.requireGas(changes, line.branchId, variant, GasState.Refill, quantity);
        changes.addGas(line.branchId, variant.id, GasState.Refill, -quantity, meta);
        changes.addGas(
          line.branchId,
          variant.id,
          GasState.Empty,
          emptiesReceived,
          meta,
        );
      }
    } catch (error) {
      this.failBatch("sellMany", changes, error);
    }

    return this.commit(changes, Operation.RefillSale, ctx);
  }

  /* ------------------------------------------------------------ integrity */

  /**
   * Rebuilds both ledgers from the audit trail and compares them to the live
   * balances. Any difference means a bug in an operation, not bad data.
   */
  assertLedgerMatchesPositions(): void {
    const expectedGas = this.ledger.replayBalances();
    for (const entry of this.inventory.entries()) {
      const key = gasKey(entry.branchId, entry.variantId, entry.state);
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
      const key = custodyKey(entry.branchId, entry.variantId, entry.custody);
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
    branchId: string,
    variant: ProductVariant,
    reason?: string,
    counterpartyBranchId?: string,
  ): MovementMeta {
    return {
      operation,
      branchId,
      counterpartyBranchId: counterpartyBranchId ?? null,
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
    branchId: string,
    variant: ProductVariant,
    state: GasState,
    quantity: number,
  ): void {
    if (quantity <= 0) return;
    const available = changes.projectedGas(branchId, variant.id, state);
    if (available < quantity) {
      throw new InsufficientStockError(
        branchId,
        variant.id,
        state,
        quantity,
        available,
      );
    }
  }

  private requireCustody(
    changes: ChangeSet,
    branchId: string,
    variant: ProductVariant,
    custody: Custody,
    quantity: number,
  ): void {
    if (quantity <= 0) return;
    const available = changes.projectedCustody(branchId, variant.id, custody);
    if (available < quantity) {
      throw new InsufficientCylindersError(
        branchId,
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
          delta.branchId,
          delta.variantId,
          delta.state,
          delta.quantity,
        );
        movementIds.push(
          this.ledger.append({
            ledgerKind: LedgerKind.Gas,
            operation: meta.operation,
            occurredAt: meta.occurredAt.toISOString(),
            branchId: delta.branchId,
            counterpartyBranchId: meta.counterpartyBranchId ?? null,
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
          delta.branchId,
          delta.variantId,
          delta.custody,
          delta.quantity,
        );
        movementIds.push(
          this.ledger.append({
            ledgerKind: LedgerKind.Cylinder,
            operation: meta.operation,
            occurredAt: meta.occurredAt.toISOString(),
            branchId: delta.branchId,
            counterpartyBranchId: meta.counterpartyBranchId ?? null,
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
      replayed: false,
    };
    if (ctx.idempotencyKey) {
      this.receipts.set(ctx.idempotencyKey, receipt);
    }
    return receipt;
  }
}
