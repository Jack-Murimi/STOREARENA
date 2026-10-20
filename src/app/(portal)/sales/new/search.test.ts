import { describe, expect, it } from "vitest";
import type { PosCatalogueItem } from "@/lib/sales/pos-data";
import { searchCatalogue } from "./search";

const product = (id: string, name: string, brandName: string, categoryCode: string, sizeKg: number | null): PosCatalogueItem => ({
  id, name, brandId: `${id}-brand`, brandName, categoryCode,
  categoryName: categoryCode === "LPG" ? "LPG cylinders" : categoryCode === "WATER" ? "Drinking water" : "Accessories & fittings",
  lineType: categoryCode === "LPG" ? "refill" : categoryCode === "WATER" ? "water" : "accessory",
  listPrice: 1000, available: 12, sizeKg,
});
const catalogue = [
  product("afri13", "Afrigas 13 kg", "Afrigas", "LPG", 13),
  product("afri6", "Afrigas 6 kg", "Afrigas", "LPG", 6),
  product("japeli10", "Japeli 10 litres", "Japeli", "WATER", null),
  product("reg13", "Regulator low pressure 13 kg fitting", "Gateway", "ACC", null),
  product("pipe", "Gas pipe", "Gateway", "ACC", null),
];
const first = (query: string) => searchCatalogue(query, catalogue).results[0]?.item.id;

describe("sales catalogue matcher", () => {
  it("is order-independent for Afrigas 13", () => {
    for (const query of ["afrigas 13", "13 afrigas", "13kg afri", "afri 13 kg", "AFRIGAS13"]) expect(first(query)).toBe("afri13");
  });
  it("normalises refill spelling and word order", () => {
    for (const query of ["refill 13 afri", "afri refil 13", "13 refill afrigas"]) expect(first(query)).toBe("afri13");
  });
  it("matches cylinder sizes exactly and normalises kg", () => {
    for (const query of ["6", "6kg", "6 kg", "6kgs", "6 kilo"]) {
      const results = searchCatalogue(query, catalogue).results;
      expect(results.map((result) => result.item.id)).toEqual(["afri6"]);
    }
  });
  it("finds water litres and accessory aliases", () => {
    expect(first("japeli 10")).toBe("japeli10");
    expect(first("10 litres japeli")).toBe("japeli10");
    expect(first("10l japeli")).toBe("japeli10");
    expect(first("reg 13")).toBe("reg13");
    expect(first("pipe")).toBe("pipe");
  });
  it("tolerates a one-character brand typo and reads trailing quantity only", () => {
    expect(first("afrgas 13")).toBe("afri13");
    expect(searchCatalogue("afrigas 13 x3", catalogue).requestedQuantity).toBe(3);
    expect(searchCatalogue("13 afrigas", catalogue).requestedQuantity).toBe(1);
  });
});
