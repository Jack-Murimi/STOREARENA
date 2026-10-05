import type { Branch, Category, ProductVariant } from "./types";
import { StockModel } from "./types";
import { Catalog } from "./catalog";
import { BranchRegistry } from "./branches";
import { Custody, GasState } from "./types";
import { StockService } from "./commands";

/* ------------------------------------------------------------- identifiers */

export const SeedId = {
  categoryCylinder: "cat-lpg-cylinder",
  categoryAccessory: "cat-accessory",

  brandAfriGas: "brand-afrigas",
  brandTotal: "brand-total",
  brandRubis: "brand-rubis",

  branchSyokimau: "br-syokimau",
  branchMlolongo: "br-mlolongo",
  branchKitengela: "br-kitengela",
  branchAthiRiver: "br-athi-river",

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
  refillPriceKsh: number;
  depositKsh: number;
}

/**
 * Prices follow typical Nairobi retail refill rates (roughly KSh 110-120/kg).
 * They are placeholders until station management maintains them in Settings.
 */
const VARIANT_SPECS: VariantSpec[] = [
  { brandId: SeedId.brandAfriGas, brandCode: "Afri Gas", sizeKg: 3, refillPriceKsh: 550, depositKsh: 900 },
  { brandId: SeedId.brandAfriGas, brandCode: "Afri Gas", sizeKg: 6, refillPriceKsh: 1050, depositKsh: 1400 },
  { brandId: SeedId.brandAfriGas, brandCode: "Afri Gas", sizeKg: 13, refillPriceKsh: 2350, depositKsh: 2600 },
  { brandId: SeedId.brandAfriGas, brandCode: "Afri Gas", sizeKg: 50, refillPriceKsh: 8450, depositKsh: 8500 },
  { brandId: SeedId.brandTotal, brandCode: "TotalEnergies", sizeKg: 6, refillPriceKsh: 1080, depositKsh: 1500 },
  { brandId: SeedId.brandTotal, brandCode: "TotalEnergies", sizeKg: 13, refillPriceKsh: 2400, depositKsh: 2700 },
  { brandId: SeedId.brandTotal, brandCode: "TotalEnergies", sizeKg: 38, refillPriceKsh: 6450, depositKsh: 6500 },
  { brandId: SeedId.brandRubis, brandCode: "Rubis", sizeKg: 6, refillPriceKsh: 1050, depositKsh: 1400 },
  { brandId: SeedId.brandRubis, brandCode: "Rubis", sizeKg: 13, refillPriceKsh: 2350, depositKsh: 2600 },
  { brandId: SeedId.brandRubis, brandCode: "Rubis", sizeKg: 38, refillPriceKsh: 6400, depositKsh: 6500 },
];

export const SEED_VARIANTS: ProductVariant[] = VARIANT_SPECS.map((spec) => ({
  id: SeedId.variant(
    spec.brandId.replace("brand-", ""),
    spec.sizeKg,
  ),
  code: `${spec.brandCode === "TotalEnergies" ? "TOTAL" : spec.brandCode === "Afri Gas" ? "AFRIGAS" : "RUBIS"}-${spec.sizeKg}`,
  categoryId: SeedId.categoryCylinder,
  brandId: spec.brandId,
  name: `${spec.brandCode} ${spec.sizeKg} kg`,
  sizeKg: spec.sizeKg,
  refillPriceKsh: spec.refillPriceKsh,
  depositKsh: spec.depositKsh,
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
    refillPriceKsh: 1200,
    depositKsh: null,
    active: true,
  },
  {
    id: "var-acc-hose",
    code: "ACC-HOSE2",
    categoryId: SeedId.categoryAccessory,
    brandId: SeedId.brandTotal,
    name: "Gas hose, 2 m",
    sizeKg: null,
    refillPriceKsh: 450,
    depositKsh: null,
    active: true,
  },
];

export const SEED_BRANCHES: Branch[] = [
  {
    id: SeedId.branchSyokimau,
    code: "SYK",
    name: "Gateway Gas — Syokimau",
    active: true,
  },
  {
    id: SeedId.branchMlolongo,
    code: "MLO",
    name: "Gateway Gas — Mlolongo",
    active: true,
  },
  {
    id: SeedId.branchKitengela,
    code: "KTG",
    name: "Gateway Gas — Kitengela",
    active: true,
  },
  {
    id: SeedId.branchAthiRiver,
    code: "ATR",
    name: "Gateway Gas — Athi River (closed for refurbishment)",
    active: false,
  },
];

/* -------------------------------------------------------- opening balances */

export interface OpeningBalance {
  branchId: string;
  variantId: string;
  refills: number;
  empties: number;
  /** Company-owned shells standing at the branch. */
  companyShellsAtBranch: number;
  /** Company-owned shells out with customers (sold new or on deposit). */
  companyShellsWithCustomers: number;
}

export const SEED_OPENING_BALANCES: OpeningBalance[] = [
  // Syokimau — the busiest branch
  { branchId: SeedId.branchSyokimau, variantId: "var-afrigas-3", refills: 42, empties: 18, companyShellsAtBranch: 54, companyShellsWithCustomers: 6 },
  { branchId: SeedId.branchSyokimau, variantId: "var-afrigas-6", refills: 14, empties: 36, companyShellsAtBranch: 45, companyShellsWithCustomers: 12 },
  { branchId: SeedId.branchSyokimau, variantId: "var-afrigas-13", refills: 23, empties: 21, companyShellsAtBranch: 40, companyShellsWithCustomers: 15 },
  { branchId: SeedId.branchSyokimau, variantId: "var-afrigas-50", refills: 3, empties: 2, companyShellsAtBranch: 5, companyShellsWithCustomers: 2 },
  { branchId: SeedId.branchSyokimau, variantId: "var-total-6", refills: 19, empties: 12, companyShellsAtBranch: 28, companyShellsWithCustomers: 9 },
  { branchId: SeedId.branchSyokimau, variantId: "var-total-13", refills: 27, empties: 9, companyShellsAtBranch: 33, companyShellsWithCustomers: 11 },
  { branchId: SeedId.branchSyokimau, variantId: "var-total-38", refills: 4, empties: 2, companyShellsAtBranch: 6, companyShellsWithCustomers: 3 },
  { branchId: SeedId.branchSyokimau, variantId: "var-rubis-6", refills: 11, empties: 7, companyShellsAtBranch: 16, companyShellsWithCustomers: 5 },
  { branchId: SeedId.branchSyokimau, variantId: "var-rubis-13", refills: 16, empties: 5, companyShellsAtBranch: 19, companyShellsWithCustomers: 7 },

  // Mlolongo
  { branchId: SeedId.branchMlolongo, variantId: "var-afrigas-6", refills: 9, empties: 14, companyShellsAtBranch: 20, companyShellsWithCustomers: 6 },
  { branchId: SeedId.branchMlolongo, variantId: "var-afrigas-13", refills: 12, empties: 8, companyShellsAtBranch: 18, companyShellsWithCustomers: 5 },
  { branchId: SeedId.branchMlolongo, variantId: "var-total-13", refills: 8, empties: 4, companyShellsAtBranch: 11, companyShellsWithCustomers: 3 },
  { branchId: SeedId.branchMlolongo, variantId: "var-rubis-6", refills: 6, empties: 3, companyShellsAtBranch: 8, companyShellsWithCustomers: 2 },

  // Kitengela
  { branchId: SeedId.branchKitengela, variantId: "var-afrigas-3", refills: 25, empties: 10, companyShellsAtBranch: 32, companyShellsWithCustomers: 4 },
  { branchId: SeedId.branchKitengela, variantId: "var-afrigas-6", refills: 7, empties: 9, companyShellsAtBranch: 14, companyShellsWithCustomers: 3 },
  { branchId: SeedId.branchKitengela, variantId: "var-total-6", refills: 5, empties: 2, companyShellsAtBranch: 6, companyShellsWithCustomers: 1 },
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

export function buildBranches(): BranchRegistry {
  const registry = new BranchRegistry();
  for (const branch of SEED_BRANCHES) registry.add(branch);
  return registry;
}

/**
 * A service loaded with the seed catalogue, branches and opening balances.
 *
 * Opening balances are written as stocktake movements rather than set directly,
 * so the audit trail reconciles from zero even for the very first record.
 */
export function createSeededService(
  openingBalances: OpeningBalance[] = SEED_OPENING_BALANCES,
): StockService {
  const service = new StockService(buildCatalog(), buildBranches());

  for (const line of openingBalances) {
    if (line.companyShellsAtBranch > line.refills + line.empties) {
      throw new Error(
        `Seed data is impossible: ${line.branchId}/${line.variantId} claims ` +
          `${line.companyShellsAtBranch} company shells but only ` +
          `${line.refills + line.empties} physical cylinders`,
      );
    }
  }

  service.stocktakeMany(
    openingBalances.flatMap((line) => [
      {
        branchId: line.branchId,
        variantId: line.variantId,
        state: GasState.Refill,
        countedQuantity: line.refills,
      },
      {
        branchId: line.branchId,
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
        branchId: line.branchId,
        variantId: line.variantId,
        custody: Custody.Branch,
        countedQuantity: line.companyShellsAtBranch,
      },
      {
        branchId: line.branchId,
        variantId: line.variantId,
        custody: Custody.Customer,
        countedQuantity: line.companyShellsWithCustomers,
      },
    ]),
    { actor: "seed", reason: OPENING_BALANCE_REASON, reference: "SEED-OPEN" },
  );

  return service;
}
