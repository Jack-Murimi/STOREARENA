import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgliteDatabase } from "../../customers/pglite";
import { ProductService, ProductError } from "../products";
import { seedCatalogue } from "../catalogue-seed";
import { GAS_BRANDS, OTHER_PRODUCTS } from "../catalogue-data";

const DDL = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

let db: PGlite;
let products: ProductService;

/** The number of products the price list should produce. */
const EXPECTED_PRODUCTS =
  GAS_BRANDS.reduce((sum, [, sizes]) => sum + sizes.length, 0) + OTHER_PRODUCTS.length;

async function stock(
  locationCode: string,
  variantName: string,
  refills: number,
  empties = 0,
): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM product_variants WHERE name = $1",
    [variantName],
  );
  const { rows: locs } = await db.query<{ id: string }>(
    "SELECT id FROM stock_locations WHERE code = $1",
    [locationCode],
  );
  for (const [state, quantity] of [
    ["REFILL", refills],
    ["EMPTY", empties],
  ] as const) {
    if (quantity > 0) {
      await db.query(
        `INSERT INTO inventory_positions (location_id, variant_id, state, quantity)
         VALUES ($1, $2, $3, $4)`,
        [locs[0].id, rows[0].id, state, quantity],
      );
    }
  }
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(DDL);
  const adapter = pgliteDatabase(db);
  products = new ProductService(adapter);
  await seedCatalogue(adapter);
});

afterEach(async () => {
  await db.close();
});

describe("the price list", () => {
  it("seeds every product on the list, once each", async () => {
    const inventory = await products.listInventory();
    const names = inventory.map((line) => line.variant.name);

    expect(inventory).toHaveLength(EXPECTED_PRODUCTS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps the three categories and knows which are weighed", async () => {
    const categories = await products.listCategories();
    expect(categories.map((c) => c.name).sort()).toEqual([
      "Accessories & fittings",
      "Drinking water",
      "LPG cylinders",
    ]);
    expect(categories.find((c) => c.name === "LPG cylinders")?.stockModel).toBe("CYLINDER");
    expect(categories.find((c) => c.name === "Drinking water")?.stockModel).toBe("SIMPLE");
  });

  it("covers every size on the list", async () => {
    const inventory = await products.listInventory();
    const sizes = [...new Set(inventory.map((l) => l.variant.sizeKg).filter((s) => s !== null))];
    expect(sizes.sort((a, b) => a - b)).toEqual([6, 13, 22.5, 35, 45, 50]);
  });

  it("treats an empty cylinder as a state, not a separate product", async () => {
    const inventory = await products.listInventory();
    // "13KG AFRIGAS EMPTY" is on the price list, but it is the same product.
    expect(inventory.filter((l) => /empty/i.test(l.variant.name))).toHaveLength(0);
    expect(inventory.filter((l) => l.variant.name === "Afrigas 13 kg")).toHaveLength(1);
  });

  it("adds nothing when it is run a second time", async () => {
    const adapter = pgliteDatabase(db);
    const before = await products.listInventory();
    await seedCatalogue(adapter);
    expect(await products.listInventory()).toHaveLength(before.length);
  });
});

describe("stock by branch", () => {
  it("shows what each branch holds, and adds empties to the cylinder count", async () => {
    await db.query(
      `INSERT INTO stock_locations (id, code, name, kind) VALUES
         ('loc-a', 'AAA', 'Syokimau', 'BRANCH'),
         ('loc-b', 'BBB', 'Mlolongo', 'BRANCH')`,
    );
    await stock("AAA", "Afrigas 13 kg", 20, 8);
    await stock("BBB", "Afrigas 13 kg", 5, 2);

    const line = (await products.listInventory()).find((l) => l.variant.name === "Afrigas 13 kg")!;

    expect(line.refills).toBe(25);
    expect(line.empties).toBe(10);
    expect(line.cylinders).toBe(35); // refills plus empties
    expect(line.byLocation.map((b) => [b.locationName, b.refills, b.empties])).toEqual([
      ["Mlolongo", 5, 2],
      ["Syokimau", 20, 8],
    ]);
  });

  it("filters to one category", async () => {
    const water = (await products.listCategories()).find((c) => c.name === "Drinking water")!;
    const only = await products.listInventory({ categoryId: water.id });

    expect(only.length).toBeGreaterThan(0);
    expect(only.every((l) => l.categoryName === "Drinking water")).toBe(true);
  });
});

describe("adding a product", () => {
  it("adds a cylinder, and a new brand in the same step", async () => {
    const lpg = (await products.listCategories()).find((c) => c.name === "LPG cylinders")!;
    const before = await products.listBrands();

    const created = await products.createProduct({
      name: "Newgas 13 kg",
      categoryId: lpg.id,
      newBrandName: "Newgas",
      sizeKg: "13",
      listPriceKsh: "2500",
    });

    expect(created.name).toBe("Newgas 13 kg");
    expect(created.sizeKg).toBe(13);
    expect(created.listPriceKsh).toBe(2500);

    const brands = await products.listBrands();
    expect(brands.length).toBe(before.length + 1);
    expect(brands.map((b) => b.name)).toContain("Newgas");
  });

  it("refuses a cylinder with no size, and a size on something that is not weighed", async () => {
    const lpg = (await products.listCategories()).find((c) => c.name === "LPG cylinders")!;
    const water = (await products.listCategories()).find((c) => c.name === "Drinking water")!;
    const brand = (await products.listBrands())[0];

    await expect(
      products.createProduct({ name: "Mystery 13", categoryId: lpg.id, brandId: brand.id }),
    ).rejects.toThrow(/sold by size/);

    await expect(
      products.createProduct({
        name: "Weighed water",
        categoryId: water.id,
        brandId: brand.id,
        sizeKg: "5",
      }),
    ).rejects.toThrow(/cannot have a kilogram size/);
  });

  it("refuses the same brand and size twice, and says which product it clashes with", async () => {
    const lpg = (await products.listCategories()).find((c) => c.name === "LPG cylinders")!;
    const afrigas = (await products.listBrands()).find((b) => b.name === "Afrigas")!;

    let caught: unknown;
    try {
      await products.createProduct({
        name: "Afrigas 13 kg again",
        categoryId: lpg.id,
        brandId: afrigas.id,
        sizeKg: 13,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProductError);
    expect((caught as ProductError).message).toContain("Afrigas 13 kg");
  });

  it("insists on a brand, either picked or typed", async () => {
    const lpg = (await products.listCategories()).find((c) => c.name === "LPG cylinders")!;
    await expect(
      products.createProduct({ name: "Orphan 13 kg", categoryId: lpg.id, sizeKg: 13 }),
    ).rejects.toThrow(/Pick a brand/);
  });
});

describe("adding a branch", () => {
  it("adds a branch, and refuses a van with nowhere to belong", async () => {
    const branch = await products.createLocation({ name: "Kitengela", code: "KTG", kind: "BRANCH" });
    expect(branch.kind).toBe("BRANCH");

    await expect(
      products.createLocation({ name: "Van 3", code: "V03", kind: "VAN" }),
    ).rejects.toThrow(/needs the branch it belongs to/);

    const van = await products.createLocation({
      name: "Van 3",
      code: "V03",
      kind: "VAN",
      homeLocationId: branch.id,
      rider: "Brian O.",
    });
    expect(van.rider).toBe("Brian O.");
    expect(van.homeLocationId).toBe(branch.id);
  });
});
