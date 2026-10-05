import { describe, expect, it } from "vitest";
import {
  Catalog,
  DuplicateCodeError,
  InvalidVariantShapeError,
  SEED_ACCESSORIES,
  SEED_LOCATIONS,
  SEED_BRANDS,
  SEED_CATEGORIES,
  SEED_VARIANTS,
  StockErrorCode,
  StockModel,
  LocationKind,
  InvalidLocationError,
  UnknownEntityError,
  buildLocations,
  buildCatalog,
} from "../index";
import { LOC } from "./helpers";

describe("catalogue reference data", () => {
  it("seeds three LPG brands: Afri Gas, TotalEnergies and Rubis", () => {
    const codes = SEED_BRANDS.map((brand) => brand.code).sort();
    expect(codes).toEqual(["AFRIGAS", "RUBIS", "TOTAL"]);
  });

  it("seeds cylinder and accessory categories with different stock models", () => {
    const cylinder = SEED_CATEGORIES.find((c) => c.code === "LPG-CYL");
    const accessory = SEED_CATEGORIES.find((c) => c.code === "ACC");
    expect(cylinder?.stockModel).toBe(StockModel.Cylinder);
    expect(accessory?.stockModel).toBe(StockModel.Simple);
  });

  it("seeds ten cylinder variants across the three brands", () => {
    expect(SEED_VARIANTS).toHaveLength(10);
    const afrigas = SEED_VARIANTS.filter((v) => v.brandId === "brand-afrigas");
    expect(afrigas.map((v) => v.sizeKg).sort((a, b) => a! - b!)).toEqual([
      3, 6, 13, 50,
    ]);
  });

  it("seeds accessories with no cylinder size", () => {
    expect(SEED_ACCESSORIES.length).toBeGreaterThan(0);
    for (const accessory of SEED_ACCESSORIES) {
      expect(accessory.sizeKg).toBeNull();
    }
  });

  it("includes one closed branch so closed-branch handling is testable", () => {
    const closed = SEED_LOCATIONS.find((b) => b.id === LOC.athiRiver);
    expect(closed?.active).toBe(false);
  });

  it("looks a variant up by brand code and size", () => {
    const catalog = buildCatalog();
    expect(catalog.findVariant("TOTAL", 13)?.name).toBe("TotalEnergies 13 kg");
    expect(catalog.findVariant("AFRIGAS", 13)?.name).toBe("Afri Gas 13 kg");
    expect(catalog.findVariant("RUBIS", 13)?.name).toBe("Rubis 13 kg");
    expect(catalog.findVariant("AFRIGAS", 38)).toBeUndefined();
  });

  it("lists the variants belonging to one brand", () => {
    const catalog = buildCatalog();
    expect(catalog.variantsOfBrand("brand-rubis")).toHaveLength(3);
  });

  it("gives every cylinder variant a list price, and no deposit", () => {
    for (const variant of SEED_VARIANTS) {
      expect(variant.listPriceKsh).toBeGreaterThan(0);
      // The business holds no deposits, so the field does not exist at all.
      expect("depositKsh" in variant).toBe(false);
    }
  });
});

describe("catalogue validation", () => {
  it("rejects a duplicate brand code", () => {
    const catalog = buildCatalog();
    expect(() =>
      catalog.addBrand({
        id: "brand-other",
        code: "AFRIGAS",
        name: "Copycat",
        depotName: "Nowhere",
      }),
    ).toThrow(DuplicateCodeError);
  });

  it("rejects a duplicate variant code", () => {
    const catalog = buildCatalog();
    expect(() =>
      catalog.addVariant({
        id: "var-rogue",
        code: "AFRIGAS-13",
        categoryId: "cat-lpg-cylinder",
        brandId: "brand-afrigas",
        name: "Rogue 13 kg",
        sizeKg: 13,
        listPriceKsh: 100,
          active: true,
      }),
    ).toThrow(DuplicateCodeError);
  });

  it("rejects a cylinder variant with no size", () => {
    const catalog = new Catalog();
    catalog.addCategory({
      id: "cat-cyl",
      code: "CYL",
      name: "Cylinders",
      stockModel: StockModel.Cylinder,
    });
    catalog.addBrand({
      id: "brand-x",
      code: "X",
      name: "X Gas",
      depotName: "X Depot",
    });

    let caught: unknown;
    try {
      catalog.addVariant({
        id: "var-x",
        code: "X-0",
        categoryId: "cat-cyl",
        brandId: "brand-x",
        name: "Mystery",
        sizeKg: null,
        listPriceKsh: 100,
          active: true,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidVariantShapeError);
    expect((caught as InvalidVariantShapeError).code).toBe(
      StockErrorCode.InvalidVariantShape,
    );
  });

  it("rejects an accessory that declares a cylinder size", () => {
    const catalog = buildCatalog();
    expect(() =>
      catalog.addVariant({
        id: "var-bad-acc",
        code: "ACC-BAD",
        categoryId: "cat-accessory",
        brandId: "brand-total",
        name: "Confused hose",
        sizeKg: 6,
        listPriceKsh: 450,
        active: true,
      }),
    ).toThrow(InvalidVariantShapeError);
  });

  it("rejects a variant pointing at a brand that does not exist", () => {
    const catalog = buildCatalog();
    expect(() =>
      catalog.addVariant({
        id: "var-ghost",
        code: "GHOST-6",
        categoryId: "cat-lpg-cylinder",
        brandId: "brand-ghost",
        name: "Ghost 6 kg",
        sizeKg: 6,
        listPriceKsh: 1000,
        active: true,
      }),
    ).toThrow(UnknownEntityError);
  });

  it("rejects a duplicate location code", () => {
    const locations = buildLocations();
    expect(() =>
      locations.add({
        id: "loc-copy",
        code: "SYK",
        name: "Copy branch",
        kind: LocationKind.Branch,
        homeLocationId: null,
        rider: null,
        active: true,
      }),
    ).toThrow(DuplicateCodeError);
  });
});

describe("location registry", () => {
  it("keeps branches and rider vans apart", () => {
    const locations = buildLocations();

    expect(locations.branches().map((l) => l.code)).toEqual([
      "SYK",
      "MLO",
      "KTG",
      "ATR",
    ]);
    expect(locations.vans().map((l) => l.code)).toEqual(["VAN-01", "VAN-02"]);
    expect(locations.require(LOC.van1)).toMatchObject({
      kind: LocationKind.Van,
      rider: "Brian O.",
      homeLocationId: LOC.syokimau,
    });
    expect(locations.vansOf(LOC.mlolongo).map((l) => l.code)).toEqual(["VAN-02"]);
    expect(locations.vansOf(LOC.kitengela)).toEqual([]);
  });

  it("refuses a van with nobody responsible for it", () => {
    const locations = buildLocations();

    expect(() =>
      locations.add({
        id: "van-x",
        code: "VAN-X",
        name: "Rider van with no rider",
        kind: LocationKind.Van,
        homeLocationId: LOC.syokimau,
        rider: null,
        active: true,
      }),
    ).toThrow(InvalidLocationError);

    expect(() =>
      locations.add({
        id: "van-y",
        code: "VAN-Y",
        name: "Rider van with no branch",
        kind: LocationKind.Van,
        homeLocationId: null,
        rider: "Brian O.",
        active: true,
      }),
    ).toThrow(InvalidLocationError);
  });

  it("refuses to give a branch a home branch", () => {
    const locations = buildLocations();

    expect(() =>
      locations.add({
        id: "loc-nested",
        code: "NST",
        name: "Nested branch",
        kind: LocationKind.Branch,
        homeLocationId: LOC.syokimau,
        rider: null,
        active: true,
      }),
    ).toThrow(InvalidLocationError);
  });
});
