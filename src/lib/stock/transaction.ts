import type { Custody, GasState, Operation, StockDelta } from "./types";
import { LedgerKind } from "./types";
import type { CylinderCustodyStore, GasInventoryStore } from "./stores";
import { custodyKey, gasKey } from "./stores";

/** Everything an audit row needs except the balances, which are computed on commit. */
export interface MovementMeta {
  operation: Operation;
  locationId: string;
  counterpartyLocationId?: string | null;
  variantId: string;
  reason: string;
  reference?: string | null;
  actor: string;
  idempotencyKey?: string | null;
  occurredAt: Date;
}

export interface StagedMovement {
  delta: StockDelta;
  meta: MovementMeta;
}

/**
 * A staged set of changes — the unit of atomicity.
 *
 * Nothing here touches the stores. A command stages everything it intends to
 * do, validating each step against the *projected* balance (live balance plus
 * everything already staged), and only then is the change set committed. If any
 * step throws, the change set is simply discarded: no partial writes exist to
 * roll back, because nothing was written yet.
 */
export class ChangeSet {
  readonly staged: StagedMovement[] = [];

  constructor(
    private readonly gasStore: GasInventoryStore,
    private readonly custodyStore: CylinderCustodyStore,
  ) {}

  get isEmpty(): boolean {
    return this.staged.length === 0;
  }

  /** Live balance plus every staged delta for the same position. */
  projectedGas(locationId: string, variantId: string, state: GasState): number {
    const key = gasKey(locationId, variantId, state);
    let staged = 0;
    for (const item of this.staged) {
      const d = item.delta;
      if (d.ledgerKind === LedgerKind.Gas && gasKey(d.locationId, d.variantId, d.state) === key) {
        staged += d.quantity;
      }
    }
    return this.gasStore.balance(locationId, variantId, state) + staged;
  }

  projectedCustody(locationId: string, variantId: string, custody: Custody): number {
    const key = custodyKey(locationId, variantId, custody);
    let staged = 0;
    for (const item of this.staged) {
      const d = item.delta;
      if (
        d.ledgerKind === LedgerKind.Cylinder &&
        custodyKey(d.locationId, d.variantId, d.custody) === key
      ) {
        staged += d.quantity;
      }
    }
    return this.custodyStore.balance(locationId, variantId, custody) + staged;
  }

  /**
   * Stages a gas movement. Zero-quantity movements are dropped as noise unless
   * `keepZero` is set — a stocktake that confirms the counted quantity is worth
   * keeping even when nothing changed.
   */
  addGas(
    locationId: string,
    variantId: string,
    state: GasState,
    quantity: number,
    meta: MovementMeta,
    options: { keepZero?: boolean } = {},
  ): this {
    if (quantity === 0 && !options.keepZero) return this;
    this.staged.push({
      delta: { ledgerKind: LedgerKind.Gas, locationId, variantId, state, quantity },
      meta,
    });
    return this;
  }

  addCustody(
    locationId: string,
    variantId: string,
    custody: Custody,
    quantity: number,
    meta: MovementMeta,
    options: { keepZero?: boolean } = {},
  ): this {
    if (quantity === 0 && !options.keepZero) return this;
    this.staged.push({
      delta: { ledgerKind: LedgerKind.Cylinder, locationId, variantId, custody, quantity },
      meta,
    });
    return this;
  }
}
