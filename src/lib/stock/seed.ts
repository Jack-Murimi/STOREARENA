import type { Category, ProductVariant, StockLocation } from "./types";
import { Custody, GasState, LocationKind, StockModel } from "./types";
import { Catalog } from "./catalog";
import { LocationRegistry } from "./locations";
import { StockService } from "./commands";

/* ------------------------------------------------------------- identifiers */

export const SeedId = {
  categoryCylinder: "cat-lpg-cylinder",
  categoryAccessory: "cat-accessory",

  brandAfriGas: "brand-afrigas",
  brandTotal: "brand-total",
  brandRubis: "brand-rubis",

  locationSyokimau: "loc-syokimau",
  locationMlolongo: "loc-mlolongo",
  locationKitengela: "loc-kitengela",
  locationAthiRiver: "loc-athi-river",
  locationVan1: "van-01",
  locationVan2: "van-02",

  variant: (brand: string, sizeKg: number) => `var-${brand}-${sizeKg}`,
} as const;

/* --------------------------------------------------------------- reference */

export const SEED_CATEGORIES: Category[] = [
  {
    id: SeedId.categoryCylinder,
    code: "LPG-CYL",
    name: "LPG Cylinders",
    stockModel: StockModel.Cylinder,
  },
  {
    id: SeedId.categoryAccessory,
    code: "ACC",
    name: "Accessories & Fittings",
    stockModel: StockModel.Simple,
  },
];

export const SEED_BRANDS = [
  {
    id: SeedId.brandAfriGas,
    code: "AFRIGAS",
    name: "Afri Gas",
    depotName: "Afri Gas Nairobi Depot",
  },
  {
    id: SeedId.brandTotal,
    code: "TOTAL",
    name: "TotalEnergies",
    depotName: "TotalEnergies Kipevu Depot",
  },
  {
    id: SeedId.brandRubis,
    code: "RUBIS",
    name: "Rubis",
    depotName: "Rubis Energy Depot",
  },
] as const;

interface VariantSpec {
  brandId: string;
  brandCode: string;
  sizeKg: number;
  listPriceKsh: number;
}

/**
 * Standard refill prices, following typical Nairobi retail rates of roughly
 * KSh 110-120 per kg. These are the *list* prices: what a customer actually
 * pays is recorded on each sale line, so any discount stays visible.
 */
const VARIANT_SPECS: VariantSpec[] = [
  { brandId: SeedId.brandAfriGas, brandCode: "AFRIGAS", sizeKg: 3, listPriceKsh: 550 },
  { brandId: SeedId.brandAfriGas, brandCode: "AFRIGAS", sizeKg: 6, listPriceKsh: 1050 },
  { brandId: SeedId.brandAfriGas, brandCode: "AFRIGAS", sizeKg: 13, listPriceKsh: 2350 },
  { brandId: SeedId.brandAfriGas, brandCode: "AFRIGAS", sizeKg: 50, listPriceKsh: 8450 },
  { brandId: SeedId.brandTotal, brandCode: "TOTAL", sizeKg: 6, listPriceKsh: 1080 },
  { brandId: SeedId.brandTotal, brandCode: "TOTAL", sizeKg: 13, listPriceKsh: 2400 },
  { brandId: SeedId.brandTotal, brandCode: "TOTAL", sizeKg: 38, listPriceKsh: 6450 },
  { brandId: SeedId.brandRubis, brandCode: "RUBIS", sizeKg: 6, listPriceKsh: 1050 },
  { brandId: SeedId.brandRubis, brandCode: "RUBIS", sizeKg: 13, listPriceKsh: 2350 },
  { brandId: SeedId.brandRubis, brandCode: "RUBIS", sizeKg: 38, listPriceKsh: 6400 },
];

const BRAND_NAMES: Record<string, string> = {
  [SeedId.brandAfriGas]: "Afri Gas",
  [SeedId.brandTotal]: "TotalEnergies",
  [SeedId.brandRubis]: "Rubis",
};

export const SEED_VARIANTS: ProductVariant[] = VARIANT_SPECS.map((spec) => ({
  id: SeedId.variant(spec.brandId.replace("brand-", ""), spec.sizeKg),
  code: `${spec.brandCode}-${spec.sizeKg}`,
  categoryId: SeedId.categoryCylinder,
  brandId: spec.brandId,
  name: `${BRAND_NAMES[spec.brandId]} ${spec.sizeKg} kg`,
  sizeKg: spec.sizeKg,
  listPriceKsh: spec.listPriceKsh,
  active: true,
}));

/** Accessories prove the category dimension: no REFILL/EMPTY lifecycle. */
export const SEED_ACCESSORIES: ProductVariant[] = [
  {
    id: "var-acc-regulator",
    code: "ACC-REG",
    categoryId: SeedId.categoryAccessory,
    brandId: SeedId.brandAfriGas,
    name: "Low-pressure regulator",
    sizeKg: null,
    listPriceKsh: 1200,
    active: true,
  },
  {
    id: "var-acc-hose",
    code: "ACC-HOSE2",
    categoryId: SeedId.categoryAccessory,
    brandId: SeedId.brandTotal,
    name: "Gas hose, 2 m",
    sizeKg: null,
    listPriceKsh: 450,
    active: true,
  },
];

/**
 * Branches and the riders' vans that belong to them. A van is a real stock
 * location: it is loaded at the branch in the morning and reconciled at night,
 * so what is on the road is never invisible.
 */
export const SEED_LOCATIONS: StockLocation[] = [
  {
    id: SeedId.locationSyokimau,
    code: "SYK",
    name: "Gateway Gas — Syokimau",
    kind: LocationKind.Branch,
    homeLocationId: null,
    rider: null,
    active: true,
  },
  {
    id: SeedId.locationMlolongo,
    code: "MLO",
    name: "Gateway Gas — Mlolongo",
    kind: LocationKind.Branch,
    homeLocationId: null,
    rider: null,
    active: true,
  },
  {
    id: SeedId.locationKitengela,
    code: "KTG",
    name: "Gateway Gas — Kitengela",
    kind: LocationKind.Branch,
    homeLocationId: null,
    rider: null,
    active: true,
  },
  {
    id: SeedId.locationAthiRiver,
    code: "ATR",
    name: "Gateway Gas — Athi River (closed for refurbishment)",
    kind: LocationKind.Branch,
    homeLocationId: null,
    rider: null,
    active: false,
  },
  {
    id: SeedId.locationVan1,
    code: "VAN-01",
    name: "Rider van — Brian O. (Syokimau)",
    kind: LocationKind.Van,
    homeLocationId: SeedId.locationSyokimau,
    rider: "Brian O.",
    active: true,
  },
  {
    id: SeedId.locationVan2,
    code: "VAN-02",
    name: "Rider van — Amina S. (Mlolongo)",
    kind: LocationKind.Van,
    homeLocationId: SeedId.locationMlolongo,
    rider: "Amina S.",
    active: true,
  },
];

/* -------------------------------------------------------- opening balances */

export interface OpeningBalance {
  locationId: string;
  variantId: string;
  refills: number;
  empties: number;
  /** Company-owned shells standing at this location. */
  companyShellsOnSite: number;
  /** Company-owned shells out with customers, to come back later. */
  companyShellsWithCustomers: number;
}

export const SEED_OPENING_BALANCES: OpeningBalance[] = [
  // Syokimau — the busiest branch
  { locationId: SeedId.locationSyokimau, variantId: "var-afrigas-3", refills: 42, empties: 18, companyShellsOnSite: 54, companyShellsWithCustomers: 6 },
  { locationId: SeedId.locationSyokimau, variantId: "var-afrigas-6", refills: 14, empties: 36, companyShellsOnSite: 45, companyShellsWithCustomers: 12 },
  { locationId: SeedId.locationSyokimau, variantId: "var-afrigas-13", refills: 23, empties: 21, companyShellsOnSite: 40, companyShellsWithCustomers: 15 },
  { locationId: SeedId.locationSyokimau, variantId: "var-afrigas-50", refills: 3, empties: 2, companyShellsOnSite: 5, companyShellsWithCustomers: 2 },
  { locationId: SeedId.locationSyokimau, variantId: "var-total-6", refills: 19, empties: 12, companyShellsOnSite: 28, companyShellsWithCustomers: 9 },
  { locationId: SeedId.locationSyokimau, variantId: "var-total-13", refills: 27, empties: 9, companyShellsOnSite: 33, companyShellsWithCustomers: 11 },
  { locationId: SeedId.locationSyokimau, variantId: "var-total-38", refills: 4, empties: 2, companyShellsOnSite: 6, companyShellsWithCustomers: 3 },
  { locationId: SeedId.locationSyokimau, variantId: "var-rubis-6", refills: 11, empties: 7, companyShellsOnSite: 16, companyShellsWithCustomers: 5 },
  { locationId: SeedId.locationSyokimau, variantId: "var-rubis-13", refills: 16, empties: 5, companyShellsOnSite: 19, companyShellsWithCustomers: 7 },

  // Mlolongo
  { locationId: SeedId.locationMlolongo, variantId: "var-afrigas-6", refills: 9, empties: 14, companyShellsOnSite: 20, companyShellsWithCustomers: 6 },
  { locationId: SeedId.locationMlolongo, variantId: "var-afrigas-13", refills: 12, empties: 8, companyShellsOnSite: 18, companyShellsWithCustomers: 5 },
  { locationId: SeedId.locationMlolongo, variantId: "var-total-13", refills: 8, empties: 4, companyShellsOnSite: 11, companyShellsWithCustomers: 3 },
  { locationId: SeedId.locationMlolongo, variantId: "var-rubis-6", refills: 6, empties: 3, companyShellsOnSite: 8, companyShellsWithCustomers: 2 },

  // Kitengela
  { locationId: SeedId.locationKitengela, variantId: "var-afrigas-3", refills: 25, empties: 10, companyShellsOnSite: 32, companyShellsWithCustomers: 4 },
  { locationId: SeedId.locationKitengela, variantId: "var-afrigas-6", refills: 7, empties: 9, companyShellsOnSite: 14, companyShellsWithCustomers: 3 },
  { locationId: SeedId.locationKitengela, variantId: "var-total-6", refills: 5, empties: 2, companyShellsOnSite: 6, companyShellsWithCustomers: 1 },

  // Vans start the day empty and are loaded by a transfer from their branch.
];

export const OPENING_BALANCE_REASON =
  "Opening balance — station cylinder count, 1 October 2026";

/* -------------------------------------------------------------- builders */

export function buildCatalog(): Catalog {
  const catalog = new Catalog();
  for (const category of SEED_CATEGORIES) catalog.addCategory(category);
  for (const brand of SEED_BRANDS) catalog.addBrand(brand);
  for (const variant of SEED_VARIANTS) catalog.addVariant(variant);
  for (const accessory of SEED_ACCESSORIES) catalog.addVariant(accessory);
  return catalog;
}

export function buildLocations(): LocationRegistry {
  const registry = new LocationRegistry();
  for (const location of SEED_LOCATIONS) registry.add(location);
  return registry;
}

/**
 * A service loaded with the seed catalogue, locations and opening balances.
 *
 * Opening balances are written as stocktake movements rather than set directly,
 * so the audit trail reconciles from zero even for the very first record.
 */
export function createSeededService(
  openingBalances: OpeningBalance[] = SEED_OPENING_BALANCES,
): StockService {
  const service = new StockService(buildCatalog(), buildLocations());

  service.stocktakeMany(
    openingBalances.flatMap((line) => [
      {
        locationId: line.locationId,
        variantId: line.variantId,
        state: GasState.Refill,
        countedQuantity: line.refills,
      },
      {
        locationId: line.locationId,
        variantId: line.variantId,
        state: GasState.Empty,
        countedQuantity: line.empties,
      },
    ]),
    { actor: "seed", reason: OPENING_BALANCE_REASON, reference: "SEED-OPEN" },
  );

  service.adjustCustody(
    openingBalances.flatMap((line) => [
      {
        locationId: line.locationId,
        variantId: line.variantId,
        custody: Custody.Branch,
        countedQuantity: line.companyShellsOnSite,
      },
      {
        locationId: line.locationId,
        variantId: line.variantId,
        custody: Custody.Customer,
        countedQuantity: line.companyShellsWithCustomers,
      },
    ]),
    { actor: "seed", reason: OPENING_BALANCE_REASON, reference: "SEED-OPEN" },
  );

  return service;
}
