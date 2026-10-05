import type { StockModel } from "./types";

/**
 * The products Gateway Gas actually sells, taken from the price list.
 *
 * Two things worth knowing about how this is shaped:
 *
 * 1. "13KG AFRIGAS EMPTY" is not a second product. An empty is a *state* of the
 *    Afri Gas 13 kg cylinder, and `inventory_positions` already keeps refill
 *    and empty counts apart — which is what makes an exchange (a full one out,
 *    an empty one back) balance instead of inventing stock.
 *
 * 2. A brand appears once, with the sizes it comes in. "MID GAS" and "MIDGAS"
 *    are the same brand spelled two ways on the list; they are one entry here.
 */

export interface CatalogueCategory {
  id: string;
  code: string;
  name: string;
  stockModel: StockModel;
}

export const CATALOGUE_CATEGORIES: CatalogueCategory[] = [
  { id: "cat-lpg", code: "LPG", name: "LPG cylinders", stockModel: "CYLINDER" as StockModel },
  { id: "cat-water", code: "WATER", name: "Drinking water", stockModel: "SIMPLE" as StockModel },
  {
    id: "cat-accessory",
    code: "ACC",
    name: "Accessories & fittings",
    stockModel: "SIMPLE" as StockModel,
  },
];

/** Brand, and the cylinder sizes it is stocked in. */
export const GAS_BRANDS: [brand: string, sizesKg: number[]][] = [
  ["AFRIGAS", [6, 13, 45]],
  ["ALFA", [13]],
  ["AMAAN", [13]],
  ["BURNER", [6]],
  ["CITY", [6, 50]],
  ["EDA", [6, 13]],
  ["EXPRESS", [50]],
  ["FUTURE", [50]],
  ["G-GAS", [50]],
  ["GASKEY", [13]],
  ["HASHI", [6, 13, 35, 50]],
  ["HASS", [13]],
  ["HUNKER", [6, 13, 50]],
  ["JAMII", [13]],
  ["JAMIL", [13]],
  ["JATEL", [13]],
  ["K-GAS", [6, 13, 35]],
  ["LAKE", [6, 13, 50]],
  ["MENGAS", [13]],
  ["MIDGAS", [6, 13, 50]],
  ["OLA", [6, 13]],
  ["ORXY", [13]],
  ["PEK", [13]],
  ["PROGAS", [6, 13, 50]],
  ["RAHA", [6, 13, 50]],
  ["SEAGAS", [6]],
  ["STABEX", [50]],
  ["SUPA", [6, 13]],
  ["TOSHA", [6, 13]],
  ["TOTAL", [6, 13, 22.5, 50]],
  ["WANJIKU", [13]],
];

/** Everything that is not a gas cylinder: no size, counted as plain stock. */
export const OTHER_PRODUCTS: { brand: string; name: string; categoryId: string }[] = [
  { brand: "JAPELI", name: "Japeli 500 ml", categoryId: "cat-water" },
  { brand: "JAPELI", name: "Japeli 1 litre", categoryId: "cat-water" },
  { brand: "JAPELI", name: "Japeli 5 litres", categoryId: "cat-water" },
  { brand: "JAPELI", name: "Japeli 10 litres", categoryId: "cat-water" },
  { brand: "JAPELI", name: "Japeli 20 litres", categoryId: "cat-water" },
  { brand: "AQUAMIST", name: "Aquamist refill", categoryId: "cat-water" },
  { brand: "KERINGET", name: "Keringet refill", categoryId: "cat-water" },
  { brand: "GENERIC", name: "Regulator — low pressure, 13 kg fitting", categoryId: "cat-accessory" },
  { brand: "GENERIC", name: "Regulator — low pressure, 6 kg fitting", categoryId: "cat-accessory" },
  { brand: "GENERIC", name: "High pressure regulator", categoryId: "cat-accessory" },
  { brand: "GENERIC", name: "Cylinder clips", categoryId: "cat-accessory" },
  { brand: "GENERIC", name: "Gas pipe", categoryId: "cat-accessory" },
  { brand: "SAFE GAS", name: "Safe Gas", categoryId: "cat-accessory" },
];

/** A human brand name from a list code: "K-GAS" -> "K-Gas". */
export function brandDisplayName(code: string): string {
  if (code === "K-GAS") return "K-Gas";
  if (code === "G-GAS") return "G-Gas";
  if (code === "GENERIC") return "Generic";
  return code
    .toLowerCase()
    .replace(/(^|\s|-)([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** "13KG AFRIGAS" on the list becomes "Afri Gas 13 kg" here. */
export function cylinderName(brandCode: string, sizeKg: number): string {
  const size = Number.isInteger(sizeKg) ? String(sizeKg) : String(sizeKg);
  return `${brandDisplayName(brandCode)} ${size} kg`;
}

export function brandSlug(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function sizeSlug(sizeKg: number): string {
  return String(sizeKg).replace(".", "-");
}
