import type { CommandContext, SalePricing, StockService } from "../index";
import { createSeededService, SeedId } from "../index";
import type { OpeningBalance } from "../index";

export const LOC = {
  syokimau: SeedId.locationSyokimau,
  mlolongo: SeedId.locationMlolongo,
  kitengela: SeedId.locationKitengela,
  /** Exists in the catalogue but is closed for refurbishment. */
  athiRiver: SeedId.locationAthiRiver,
  /** Rider vans: loaded at their branch, reconciled at the end of the shift. */
  van1: SeedId.locationVan1,
  van2: SeedId.locationVan2,
} as const;

export const VARIANT = {
  afrigas3: SeedId.variant("afrigas", 3),
  afrigas6: SeedId.variant("afrigas", 6),
  afrigas13: SeedId.variant("afrigas", 13),
  afrigas50: SeedId.variant("afrigas", 50),
  total6: SeedId.variant("total", 6),
  total13: SeedId.variant("total", 13),
  total38: SeedId.variant("total", 38),
  rubis6: SeedId.variant("rubis", 6),
  rubis13: SeedId.variant("rubis", 13),
  /** An accessory: no REFILL/EMPTY lifecycle. */
  regulator: "var-acc-regulator",
} as const;

/** Syokimau opening balances, so tests can assert against known numbers. */
export const OPENING = {
  afrigas13: { refill: 23, empty: 21, cylinders: 44, companyShells: 40 },
  total13: { refill: 27, empty: 9, cylinders: 36, companyShells: 33 },
  afrigas6: { refill: 14, empty: 36, cylinders: 50, companyShells: 45 },
  total6: { refill: 19, empty: 12, cylinders: 31, companyShells: 28 },
  afrigas3: { refill: 42, empty: 18, cylinders: 60, companyShells: 54 },
} as const;

export function seeded(): StockService {
  return createSeededService();
}

/** A service with a hand-built opening balance, for edge-case scenarios. */
export function seededWith(opening: OpeningBalance[]): StockService {
  return createSeededService(opening);
}

/** Prices a line at the variant's list price — the no-discount case. */
export function atList(service: StockService, variantId: string): SalePricing {
  return { unitPriceKsh: service.catalog.requireVariant(variantId).listPriceKsh! };
}

let counter = 0;

/**
 * Every command needs an actor. References are unique per call so a test that
 * forgets to set one cannot accidentally collide with another.
 */
export function context(overrides: Partial<CommandContext> = {}): CommandContext {
  counter += 1;
  return { actor: "Joyce W.", reference: `TEST-${counter}`, ...overrides };
}
