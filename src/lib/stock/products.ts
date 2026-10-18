import type { Brand, Category, ProductVariant, StockLocation } from "./types";
import { LocationKind, StockModel } from "./types";

type Row = Record<string, unknown>;

export interface Database {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
}

export class ProductError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ProductError";
  }
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
const bool = (v: unknown): boolean => v === true || v === "t" || v === "true";

export interface StockAt {
  locationId: string;
  locationCode: string;
  locationName: string;
  kind: LocationKind;
  refills: number;
  empties: number;
}

export interface InventoryLine {
  variant: ProductVariant;
  categoryName: string;
  brandName: string;
  brandCode: string;
  /** Cylinders on hand: refills plus empties. */
  cylinders: number;
  refills: number;
  empties: number;
  byLocation: StockAt[];
}

export interface NewCategoryInput {
  name: string;
  stockModel: StockModel | string;
}

export interface NewProductInput {
  /** Required for a SIMPLE item. Cylinder names are derived from brand + size. */
  name?: string | null;
  categoryId: string;
  /** An existing brand, or a new one to create with the product. */
  brandId?: string | null;
  newBrandName?: string | null;
  /** One cylinder size; retained for single-product callers. */
  sizeKg?: number | string | null;
  /** Comma-separated cylinder sizes when several variants are created together. */
  sizeKgs?: number | string | null;
  /** Optional per-size prices, keyed by a normalized kilogram size such as "13". */
  sizePrices?: Record<string, number | string | null> | null;
  /** Price for one simple item, or a compatibility fallback for cylinders. */
  listPriceKsh?: number | string | null;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 14)}`;
}

const slug = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Catalogue names are deliberately identifiers, not title-cased prose. */
const normalizeName = (value: unknown): string =>
  str(value).trim().replace(/\s+/g, " ").toUpperCase();

const sizeLabel = (sizeKg: number): string =>
  Number.isInteger(sizeKg) ? String(sizeKg) : String(sizeKg);

function parseSizeList(raw: number | string | null | undefined): number[] {
  if (raw === null || raw === undefined || String(raw).trim() === "") return [];
  const parts = typeof raw === "number" ? [String(raw)] : String(raw).split(/[,;\n]+/);
  const sizes = parts.map((part) => Number(part.trim()));
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0)) {
    throw new ProductError(
      "BAD_SIZE",
      "Use positive kilogram sizes separated with commas, for example 3, 6, 13.",
    );
  }
  if (new Set(sizes).size !== sizes.length) {
    throw new ProductError("DUPLICATE_SIZE", "Enter each cylinder size only once.");
  }
  return sizes;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "23505" || /unique|duplicate/i.test(String(candidate.message ?? ""));
}

/**
 * The product catalogue and what each branch is holding.
 *
 * Reference data (categories, brands, variants) is separate from stock on
 * purpose: creating a product is an administrative act, whereas stock only
 * ever moves through a recorded movement, so the two can never disagree.
 */
export class ProductService {
  constructor(readonly db: Database) {}

  // ------------------------------------------------------------- reference

  async listCategories(): Promise<Category[]> {
    const rows = await this.db.query<Row>("SELECT * FROM categories ORDER BY name");
    return rows.map((r) => ({
      id: str(r.id),
      code: str(r.code),
      name: str(r.name),
      stockModel: str(r.stock_model) as StockModel,
    }));
  }

  async listBrands(): Promise<Brand[]> {
    const rows = await this.db.query<Row>("SELECT * FROM brands ORDER BY name");
    return rows.map((r) => ({
      id: str(r.id),
      code: str(r.code),
      name: str(r.name),
      depotName: str(r.depot_name),
    }));
  }

  async listLocations(): Promise<StockLocation[]> {
    const rows = await this.db.query<Row>(
      "SELECT * FROM stock_locations ORDER BY kind, name",
    );
    return rows.map((r) => ({
      id: str(r.id),
      code: str(r.code),
      name: str(r.name),
      kind: str(r.kind) as LocationKind,
      homeLocationId: strOrNull(r.home_location_id),
      rider: strOrNull(r.rider),
      active: bool(r.active),
    }));
  }

  // --------------------------------------------------------------- stock

  /**
   * Every product with what each branch holds. Two queries for the whole
   * page, however many products or branches there are.
   */
  async listInventory(options: { categoryId?: string | null } = {}): Promise<InventoryLine[]> {
    const params: unknown[] = [];
    let where = "";
    if (options.categoryId) {
      params.push(options.categoryId);
      where = "WHERE v.category_id = $1";
    }

    const [variants, positions] = await Promise.all([
      this.db.query<Row>(
        `SELECT v.*, c.name AS category_name, b.code AS brand_code, b.name AS brand_name
           FROM product_variants v
           JOIN categories c ON c.id = v.category_id
           JOIN brands b ON b.id = v.brand_id
           ${where}
          ORDER BY v.size_kg NULLS LAST, b.name, c.name`,
        params,
      ),
      this.db.query<Row>(
        `SELECT p.variant_id, p.state, p.quantity, l.id AS location_id,
                l.code AS location_code, l.name AS location_name, l.kind
           FROM inventory_positions p
           JOIN stock_locations l ON l.id = p.location_id
          WHERE p.quantity > 0
          ORDER BY l.name`,
      ),
    ]);

    return variants.map((row) => {
      const id = str(row.id);
      const mine = positions.filter((p) => str(p.variant_id) === id);
      const byLocation: StockAt[] = [];
      for (const p of mine) {
        const locationId = str(p.location_id);
        let at = byLocation.find((b) => b.locationId === locationId);
        if (!at) {
          at = {
            locationId,
            locationCode: str(p.location_code),
            locationName: str(p.location_name),
            kind: str(p.kind) as LocationKind,
            refills: 0,
            empties: 0,
          };
          byLocation.push(at);
        }
        if (str(p.state) === "REFILL") at.refills += Number(p.quantity);
        else at.empties += Number(p.quantity);
      }
      const refills = byLocation.reduce((sum, b) => sum + b.refills, 0);
      const empties = byLocation.reduce((sum, b) => sum + b.empties, 0);
      return {
        variant: {
          id,
          code: str(row.code),
          categoryId: str(row.category_id),
          brandId: str(row.brand_id),
          name: str(row.name),
          sizeKg: numOrNull(row.size_kg),
          listPriceKsh: numOrNull(row.list_price_ksh),
          active: bool(row.active),
        },
        categoryName: str(row.category_name),
        brandName: str(row.brand_name),
        brandCode: str(row.brand_code),
        cylinders: refills + empties,
        refills,
        empties,
        byLocation,
      };
    });
  }

  // ------------------------------------------------------------- creating

  /** Adds a category before its first product is created. */
  async createCategory(input: NewCategoryInput): Promise<Category> {
    const name = normalizeName(input.name);
    if (name.length < 2) {
      throw new ProductError("BAD_CATEGORY_NAME", "Give the category a name of at least two characters.");
    }

    const stockModel = str(input.stockModel).toUpperCase();
    if (stockModel !== StockModel.Cylinder && stockModel !== StockModel.Simple) {
      throw new ProductError("BAD_STOCK_MODEL", "Choose Cylinder or Simple item for this category.");
    }

    const existing = await this.findCategoryByName(this.db, name);
    if (existing) {
      throw new ProductError("DUPLICATE_CATEGORY", `${existing.name} already exists. Choose it from the list.`);
    }

    const code = await this.nextAvailableCode(this.db, "categories", slug(name), "CAT");
    const id = newId("cat");
    try {
      await this.db.query(
        "INSERT INTO categories (id, code, name, stock_model) VALUES ($1, $2, $3, $4)",
        [id, code, name, stockModel],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.findCategoryByName(this.db, name);
        if (raced) {
          throw new ProductError("DUPLICATE_CATEGORY", `${raced.name} already exists. Choose it from the list.`);
        }
        throw new ProductError("DUPLICATE_CATEGORY", "A category with that code already exists. Try a more specific name.");
      }
      throw error;
    }

    return { id, code, name, stockModel: stockModel as StockModel };
  }

  /**
   * Adds one catalogue variant. Kept for callers that create a single item;
   * the entry form can use createProducts for several cylinder sizes at once.
   */
  async createProduct(input: NewProductInput): Promise<ProductVariant> {
    if (input.sizeKgs !== null && input.sizeKgs !== undefined && parseSizeList(input.sizeKgs).length > 1) {
      throw new ProductError(
        "MULTIPLE_PRODUCTS",
        "Use createProducts when adding more than one cylinder size.",
      );
    }
    const created = await this.createProducts(input);
    return created[0];
  }

  /**
   * Adds one or many catalogue variants atomically. A cylinder's name always
   * comes from its brand and size, e.g. `AFRIGAS 13 KG`; REFILL and EMPTY stay
   * inventory states rather than becoming products.
   */
  async createProducts(input: NewProductInput): Promise<ProductVariant[]> {
    return this.db.transaction((tx) => this.createProductsInTransaction(tx, input));
  }

  private async createProductsInTransaction(
    db: Database,
    input: NewProductInput,
  ): Promise<ProductVariant[]> {
    const category = await this.findCategory(db, input.categoryId);
    const brand = await this.resolveBrand(db, input);
    const rawSizes = input.sizeKgs ?? input.sizeKg;
    const sizes = parseSizeList(rawSizes);

    if (category.stockModel === StockModel.Cylinder && sizes.length === 0) {
      throw new ProductError(
        "SIZE_REQUIRED",
        `${category.name} are sold by size — enter one or more kilogram sizes.`,
      );
    }
    if (category.stockModel !== StockModel.Cylinder && sizes.length > 0) {
      throw new ProductError(
        "SIZE_FORBIDDEN",
        `${category.name} are not weighed, so they cannot have a kilogram size.`,
      );
    }

    const productSizes: Array<number | null> =
      category.stockModel === StockModel.Cylinder ? sizes : [null];
    const simpleName = normalizeName(input.name);
    if (category.stockModel !== StockModel.Cylinder && simpleName.length < 2) {
      throw new ProductError("BAD_NAME", "Give the product a name.");
    }

    const resolvePrice = (rawPrice: number | string | null | undefined): number | null => {
      if (rawPrice === null || rawPrice === undefined || String(rawPrice).trim() === "") return null;
      const price = Number(rawPrice);
      if (!Number.isFinite(price) || price <= 0) {
        throw new ProductError("BAD_PRICE", "A selling price must be greater than zero.");
      }
      return price;
    };

    const drafts: Array<{
      id: string;
      code: string;
      name: string;
      sizeKg: number | null;
      listPriceKsh: number | null;
    }> = [];
    for (const sizeKg of productSizes) {
      const name =
        category.stockModel === StockModel.Cylinder
          ? `${normalizeName(brand.name)} ${sizeLabel(sizeKg!)} KG`
          : simpleName;
      const priceKey = sizeKg === null ? "" : sizeLabel(sizeKg);
      const hasPerSizePrices =
        category.stockModel === StockModel.Cylinder && input.sizePrices !== null && input.sizePrices !== undefined;
      const hasPriceForSize = Boolean(
        input.sizePrices && Object.prototype.hasOwnProperty.call(input.sizePrices, priceKey),
      );
      const rawPrice = hasPriceForSize ? input.sizePrices![priceKey] : input.listPriceKsh;
      if (
        hasPerSizePrices &&
        (!hasPriceForSize || rawPrice === null || rawPrice === undefined || String(rawPrice).trim() === "")
      ) {
        throw new ProductError("BAD_PRICE", `Enter a selling price for ${sizeLabel(sizeKg!)} KG.`);
      }
      const listPriceKsh = resolvePrice(rawPrice);

      const clash = await db.query<Row>(
        category.stockModel === StockModel.Cylinder
          ? "SELECT name FROM product_variants WHERE brand_id = $1 AND size_kg = $2"
          : `SELECT name
               FROM product_variants
              WHERE brand_id = $1
                AND category_id = $2
                AND upper(btrim(name)) = $3`,
        category.stockModel === StockModel.Cylinder
          ? [brand.id, sizeKg]
          : [brand.id, category.id, name],
      );
      if (clash.length > 0) {
        throw new ProductError("DUPLICATE", `${str(clash[0].name)} is already on the catalogue.`);
      }

      drafts.push({
        id: newId("var"),
        code:
          category.stockModel === StockModel.Cylinder
            ? `${category.code}-${slug(brand.code)}-${String(sizeKg).replace(".", "-")}`
            : `${category.code}-${slug(brand.code)}-${slug(name).slice(0, 24)}`,
        name,
        sizeKg,
        listPriceKsh,
      });
    }

    const created: ProductVariant[] = [];
    for (const draft of drafts) {
      try {
        await db.query(
          `INSERT INTO product_variants (id, code, category_id, brand_id, name, size_kg, list_price_ksh)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            draft.id,
            draft.code,
            category.id,
            brand.id,
            draft.name,
            draft.sizeKg,
            draft.listPriceKsh,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          const existing = await db.query<Row>(
            category.stockModel === StockModel.Cylinder
              ? "SELECT name FROM product_variants WHERE brand_id = $1 AND size_kg = $2"
              : `SELECT name
                   FROM product_variants
                  WHERE brand_id = $1 AND category_id = $2 AND upper(btrim(name)) = $3`,
            category.stockModel === StockModel.Cylinder
              ? [brand.id, draft.sizeKg]
              : [brand.id, category.id, draft.name],
          );
          if (existing.length > 0) {
            throw new ProductError("DUPLICATE", `${str(existing[0].name)} is already on the catalogue.`);
          }
          throw new ProductError("DUPLICATE", "That product already exists on the catalogue.");
        }
        throw error;
      }

      created.push({
        id: draft.id,
        code: draft.code,
        categoryId: category.id,
        brandId: brand.id,
        name: draft.name,
        sizeKg: draft.sizeKg,
        listPriceKsh: draft.listPriceKsh,
        active: true,
      });
    }

    return created;
  }

  private async findCategory(db: Database, categoryId: string): Promise<Category> {
    const rows = await db.query<Row>("SELECT * FROM categories WHERE id = $1", [categoryId]);
    if (rows.length === 0) {
      throw new ProductError("NO_CATEGORY", "Choose a category for this product.");
    }
    return this.toCategory(rows[0]);
  }

  private async findCategoryByName(db: Database, name: string): Promise<Category | null> {
    const rows = await db.query<Row>(
      "SELECT * FROM categories WHERE upper(btrim(name)) = $1 LIMIT 1",
      [name],
    );
    return rows.length === 0 ? null : this.toCategory(rows[0]);
  }

  private toCategory(row: Row): Category {
    return {
      id: str(row.id),
      code: str(row.code),
      name: str(row.name),
      stockModel: str(row.stock_model) as StockModel,
    };
  }

  private toBrand(row: Row): Brand {
    return {
      id: str(row.id),
      code: str(row.code),
      name: str(row.name),
      depotName: str(row.depot_name),
    };
  }

  private async nextAvailableCode(
    db: Database,
    table: "categories" | "brands",
    rawBase: string,
    fallback: string,
  ): Promise<string> {
    const base = rawBase.length >= 2 ? rawBase : fallback;
    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const rows = await db.query<Row>(`SELECT 1 FROM ${table} WHERE code = $1 LIMIT 1`, [candidate]);
      if (rows.length === 0) return candidate;
    }
    throw new ProductError("CODE_EXHAUSTED", "Could not assign a unique code. Try a more specific name.");
  }

  /** Uses the brand you picked, or creates the uppercase brand you typed. */
  private async resolveBrand(db: Database, input: NewProductInput): Promise<Brand> {
    if (input.brandId) {
      const rows = await db.query<Row>("SELECT * FROM brands WHERE id = $1", [input.brandId]);
      if (rows.length === 0) throw new ProductError("NO_BRAND", "That brand no longer exists.");
      return this.toBrand(rows[0]);
    }

    const name = normalizeName(input.newBrandName);
    if (name.length < 2) {
      throw new ProductError("NO_BRAND", "Pick a brand, or type a new one.");
    }

    const existing = await db.query<Row>(
      "SELECT * FROM brands WHERE upper(btrim(name)) = $1 LIMIT 1",
      [name],
    );
    if (existing.length > 0) return this.toBrand(existing[0]);

    const code = await this.nextAvailableCode(db, "brands", slug(name), "BRAND");
    const id = newId("brand");
    try {
      await db.query(
        "INSERT INTO brands (id, code, name, depot_name) VALUES ($1, $2, $3, $4)",
        [id, code, name, name],
      );
      return { id, code, name, depotName: name };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await db.query<Row>(
          "SELECT * FROM brands WHERE upper(btrim(name)) = $1 LIMIT 1",
          [name],
        );
        if (raced.length > 0) return this.toBrand(raced[0]);
        throw new ProductError("DUPLICATE_BRAND", "A brand with that code already exists. Try a more specific name.");
      }
      throw error;
    }
  }

  /** Adds a branch or a rider van. */
  async createLocation(input: {
    name: string;
    code: string;
    kind: LocationKind | string;
    homeLocationId?: string | null;
    rider?: string | null;
  }): Promise<StockLocation> {
    const name = (input.name ?? "").trim();
    const code = slug(input.code ?? "");
    if (name.length < 2) throw new ProductError("BAD_NAME", "Give the branch a name.");
    if (code.length < 2) throw new ProductError("BAD_CODE", "Give the branch a short code.");

    const kind = String(input.kind ?? "").toUpperCase();
    if (kind !== LocationKind.Branch && kind !== LocationKind.Van) {
      throw new ProductError("BAD_KIND", "A location is either a branch or a van.");
    }
    const homeLocationId = strOrNull(input.homeLocationId);
    const rider = strOrNull(input.rider);
    if (kind === LocationKind.Van && (!homeLocationId || !rider)) {
      throw new ProductError(
        "VAN_NEEDS_HOME",
        "A van needs the branch it belongs to and the rider responsible for it.",
      );
    }

    const id = newId(kind === LocationKind.Van ? "van" : "loc");
    await this.db.query(
      `INSERT INTO stock_locations (id, code, name, kind, home_location_id, rider)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, code, name, kind, kind === LocationKind.Van ? homeLocationId : null,
       kind === LocationKind.Van ? rider : null],
    );
    return {
      id,
      code,
      name,
      kind: kind as LocationKind,
      homeLocationId: kind === LocationKind.Van ? homeLocationId : null,
      rider: kind === LocationKind.Van ? rider : null,
      active: true,
    };
  }
}
