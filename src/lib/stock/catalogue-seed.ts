import type { Database } from "./products";
import {
  CATALOGUE_CATEGORIES,
  GAS_BRANDS,
  OTHER_PRODUCTS,
  brandDisplayName,
  brandSlug,
  cylinderName,
  sizeSlug,
} from "./catalogue-data";

export interface CatalogueCounts {
  categories: number;
  brands: number;
  products: number;
}

/**
 * Puts the real price list into an empty database.
 *
 * Every statement is `ON CONFLICT DO NOTHING`, so this is safe to run again on
 * a database that already has stock in it — it adds what is missing and leaves
 * everything else alone. It never touches quantities.
 */
export async function seedCatalogue(db: Database): Promise<CatalogueCounts> {
  for (const category of CATALOGUE_CATEGORIES) {
    await db.query(
      `INSERT INTO categories (id, code, name, stock_model) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [category.id, category.code, category.name, category.stockModel],
    );
  }

  const brands = new Map<string, { id: string; code: string; name: string }>();
  const addBrand = async (code: string) => {
    const slug = brandSlug(code);
    const id = `brand-${slug}`;
    const name = brandDisplayName(code);
    if (!brands.has(id)) {
      await db.query(
        `INSERT INTO brands (id, code, name, depot_name) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [id, code, name, name],
      );
      brands.set(id, { id, code, name });
    }
    return brands.get(id)!;
  };

  let products = 0;

  for (const [code, sizes] of GAS_BRANDS) {
    const brand = await addBrand(code);
    for (const size of sizes) {
      await db.query(
        `INSERT INTO product_variants (id, code, category_id, brand_id, name, size_kg)
         VALUES ($1, $2, 'cat-lpg', $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [
          `var-${brandSlug(code)}-${sizeSlug(size)}`,
          `LPG-${brandSlug(code).toUpperCase()}-${sizeSlug(size)}`,
          brand.id,
          cylinderName(code, size),
          size,
        ],
      );
      products += 1;
    }
  }

  for (const product of OTHER_PRODUCTS) {
    const brand = await addBrand(product.brand);
    const suffix = brandSlug(product.name);
    const prefix = product.categoryId === "cat-water" ? "WTR" : "ACC";
    await db.query(
      `INSERT INTO product_variants (id, code, category_id, brand_id, name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [`var-${suffix}`, `${prefix}-${suffix.toUpperCase()}`, product.categoryId, brand.id, product.name],
    );
    products += 1;
  }

  return { categories: CATALOGUE_CATEGORIES.length, brands: brands.size, products };
}
