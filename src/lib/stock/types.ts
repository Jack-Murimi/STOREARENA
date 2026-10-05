/**
 * Gateway Gas Enterprises — LPG stock domain types.
 *
 * Two ledgers, kept deliberately separate:
 *
 *  1. GAS STOCK — consumable product held at a branch, counted per variant and
 *     per state (`REFILL` = filled and saleable, `EMPTY` = shell awaiting
 *     refill or depot return).
 *  2. CYLINDER CUSTODY — the physical steel, counted per variant by where the
 *     company's own shells currently sit (`BRANCH`, `DEPOT`, `CUSTOMER`,
 *     `IN_TRANSIT`).
 *
 * Conflating the two is the classic LPG bug: a branch can be holding gas in
 * shells it does not own, or own shells that are empty and therefore worth
 * nothing until refilled. Every operation below states exactly which of the
 * two ledgers it touches.
 */

/** Physical state of gas stock at a branch. */
export const GasState = {
  /** Filled cylinder, ready to sell. */
  Refill: "REFILL",
  /** Empty shell awaiting refill or return to the brand depot. */
  Empty: "EMPTY",
} as const;
export type GasState = (typeof GasState)[keyof typeof GasState];

export const GAS_STATES: readonly GasState[] = [GasState.Refill, GasState.Empty];

/** How a variant is counted. Accessories have no REFILL/EMPTY lifecycle. */
export const StockModel = {
  Cylinder: "CYLINDER",
  Simple: "SIMPLE",
} as const;
export type StockModel = (typeof StockModel)[keyof typeof StockModel];

/** Where a company-owned cylinder currently is. */
export const Custody = {
  Branch: "BRANCH",
  Depot: "DEPOT",
  Customer: "CUSTOMER",
  InTransit: "IN_TRANSIT",
} as const;
export type Custody = (typeof Custody)[keyof typeof Custody];

export const CUSTODY_STATES: readonly Custody[] = [
  Custody.Branch,
  Custody.Depot,
  Custody.Customer,
  Custody.InTransit,
];

/** Every mutation the stock service can perform. */
export const Operation = {
  /** Filled cylinders received from the brand depot. */
  Purchase: "PURCHASE",
  /** Gas sold into a customer's own cylinder (or a like-for-like swap). */
  RefillSale: "REFILL_SALE",
  /** Gas sold in a company cylinder that leaves with the customer. */
  NewCylinderSale: "NEW_CYLINDER_SALE",
  /** Like-for-like swap: filled out, empty in, same brand. */
  Exchange: "EXCHANGE",
  /** A shell is handed back at the counter. */
  EmptyReturn: "EMPTY_RETURN",
  /** Company empties sent back to the brand depot. */
  DepotReturn: "DEPOT_RETURN",
  /** Stock moved between Gateway branches. */
  Transfer: "TRANSFER",
  /** Counted correction, always with a reason. */
  Stocktake: "STOCKTAKE",
} as const;
export type Operation = (typeof Operation)[keyof typeof Operation];

/** Which ledger a movement belongs to. */
export const LedgerKind = {
  Gas: "GAS",
  Cylinder: "CYLINDER",
} as const;
export type LedgerKind = (typeof LedgerKind)[keyof typeof LedgerKind];

export interface Category {
  id: string;
  code: string;
  name: string;
  stockModel: StockModel;
}

export interface Brand {
  id: string;
  code: string;
  name: string;
  /** Name of the depot this brand's empties go back to. */
  depotName: string;
}

export interface ProductVariant {
  id: string;
  code: string;
  categoryId: string;
  brandId: string;
  /** Display name, e.g. "Afri Gas 13 kg". */
  name: string;
  /** Nominal fill weight. Null for non-cylinder variants. */
  sizeKg: number | null;
  /**
   * Standard retail refill price — the starting point for a sale, never the
   * amount actually charged. The charged price lives on the sale line, so a
   * discount is always visible as the gap between the two.
   */
  listPriceKsh: number | null;
  active: boolean;
}

/**
 * A branch is a fixed station. A van is a rider's mobile stock: it is loaded at
 * the branch, sells at the customer's door, and hands back what is left plus
 * the empties collected.
 */
export const LocationKind = {
  Branch: "BRANCH",
  Van: "VAN",
} as const;
export type LocationKind = (typeof LocationKind)[keyof typeof LocationKind];

export interface StockLocation {
  id: string;
  code: string;
  name: string;
  kind: LocationKind;
  /** The branch a van belongs to. Null for a branch. */
  homeLocationId: string | null;
  /** Rider responsible for a van. Null for a branch. */
  rider: string | null;
  active: boolean;
}

/** Where a sale happened: over the counter, or at the customer's door. */
export const Channel = {
  WalkIn: "WALK_IN",
  Delivery: "DELIVERY",
  /** Purchases, transfers, stocktakes — not a customer sale. */
  Internal: "INTERNAL",
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

/** Composite key for a gas stock position. */
export interface PositionKey {
  locationId: string;
  variantId: string;
  state: GasState;
}

/** Composite key for a cylinder custody position. */
export interface CustodyKey {
  locationId: string;
  variantId: string;
  custody: Custody;
}

/** An immutable, append-only audit row. */
export interface StockMovement {
  id: string;
  /** Monotonic sequence number, assigned by the ledger. */
  seq: number;
  ledgerKind: LedgerKind;
  operation: Operation;
  /** ISO-8601, when the physical event happened. */
  occurredAt: string;
  /** ISO-8601, when the record was written. */
  recordedAt: string;
  locationId: string;
  /** Set for transfers: the branch on the other end. */
  counterpartyLocationId: string | null;
  variantId: string;
  /** Gas movements carry a state; custody movements carry a custody. */
  state: GasState | null;
  custody: Custody | null;
  /** Signed quantity. */
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  reference: string | null;
  actor: string;
  idempotencyKey: string | null;
}

/** Who did it, and how to find it again. */
export interface CommandContext {
  /** The staff member or rider responsible. Never blank. */
  actor: string;
  /** Defaults to Internal; sales set WalkIn or Delivery. */
  channel?: Channel;
  /** External document number: receipt, delivery note, transfer slip. */
  reference?: string;
  /** Defaults to the moment the command runs. */
  occurredAt?: Date;
  /** Replaying a command with the same key is a no-op. */
  idempotencyKey?: string;
  reason?: string;
  /** Customer or delivery reference, recorded on the sale. */
  customer?: string;
}

/** A single staged change to one of the two ledgers. */
export type StockDelta =
  | {
      ledgerKind: typeof LedgerKind.Gas;
      locationId: string;
      variantId: string;
      state: GasState;
      quantity: number;
    }
  | {
      ledgerKind: typeof LedgerKind.Cylinder;
      locationId: string;
      variantId: string;
      custody: Custody;
      quantity: number;
    };

/** Returned by every successful command. */
export interface OperationReceipt {
  operation: Operation;
  idempotencyKey: string | null;
  committedAt: string;
  movementIds: string[];
  deltas: StockDelta[];
  /** Set when the operation also recorded a sale. */
  saleId: string | null;
  /** True when the command was a replay of an earlier one. */
  replayed: boolean;
}

/**
 * What one line of a sale cost, and what it should have cost.
 *
 * Omit it entirely and the customer is charged list price. Say anything else
 * and you must say why — see `resolvePricing`.
 */
export interface SalePricing {
  /** Defaults to the variant's list price. */
  listPriceKsh?: number;
  /** What the customer actually paid per cylinder. Defaults to list. */
  unitPriceKsh?: number;
  /** Required whenever the charged price differs from list. */
  discountReason?: string;
}

export interface SaleLine {
  variantId: string;
  quantity: number;
  listPriceKsh: number;
  unitPriceKsh: number;
  /** Null when the customer paid list price. */
  discountReason: string | null;
  listTotalKsh: number;
  chargedTotalKsh: number;
}

/** A sale as the office sees it: money, channel, who took it, what was discounted. */
export interface Sale {
  id: string;
  locationId: string;
  channel: Channel;
  operation: Operation;
  occurredAt: string;
  actor: string;
  customer: string | null;
  reference: string | null;
  idempotencyKey: string | null;
  lines: SaleLine[];
  listTotalKsh: number;
  chargedTotalKsh: number;
  /** listTotalKsh - chargedTotalKsh. Zero means nobody got a discount. */
  discountKsh: number;
}

/** Snapshot of a variant's position at one location. */
export interface VariantPosition {
  locationId: string;
  variantId: string;
  refill: number;
  empty: number;
  /** Physical cylinders standing here: refill + empty. */
  cylinders: number;
  /** Company-owned shells held at this branch, for reference. */
  companyShellsOnSite: number;
}
