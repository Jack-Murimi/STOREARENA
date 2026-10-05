/**
 * Gateway Gas Enterprises — LPG stock domain.
 *
 * This module has no React, no Next.js and no database dependency: it is pure
 * TypeScript so it can be unit tested on its own, called from a route handler,
 * or reused by a CLI import job. Persistence is a separate concern — see
 * `schema.sql` for the relational shape and `docs/STOCK_ARCHITECTURE.md` for
 * the reasoning behind the two ledgers.
 */

export * from "./types";
export * from "./errors";

export { Catalog } from "./catalog";
export { LocationRegistry } from "./locations";
export { GasInventoryStore, CylinderCustodyStore, custodyKey, gasKey } from "./stores";
export { MovementLedger } from "./ledger";
export type { MovementDraft, MovementQuery } from "./ledger";
export { ChangeSet } from "./transaction";
export type { MovementMeta, StagedMovement } from "./transaction";
export {
  MIN_PRICE_REASON_LENGTH,
  SaleLedger,
  buildSaleLine,
  resolvePricing,
} from "./sales";
export type { ResolvedPricing } from "./sales";

export { StockService } from "./commands";
export type {
  CustodyAdjustmentInput,
  DepotReturnInput,
  EmptyReturnInput,
  ExchangeInput,
  PurchaseInput,
  RefillSaleInput,
  RefillSaleLine,
  SellWithCylinderInput,
  StocktakeInput,
  TransferInput,
} from "./commands";

export {
  buildCatalog,
  buildLocations,
  createSeededService,
  OPENING_BALANCE_REASON,
  SEED_ACCESSORIES,
  SEED_BRANDS,
  SEED_CATEGORIES,
  SEED_LOCATIONS,
  SEED_OPENING_BALANCES,
  SEED_VARIANTS,
  SeedId,
} from "./seed";
export type { OpeningBalance } from "./seed";
