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

export interface NewProductInput {
  name: string;
  categoryId: string;
  /** An existing brand, or a new one to create with the product. */
  brandId?: string | null;
  newBrandName?: string | null;
  /** Required for a cylinder, forbidden for anything else. */
  sizeKg?: number | string | null;
  listPriceKsh?: number | string | null;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 14)}`;
}

const slug = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

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
          ORDER BY c.name, v.size_kg NULLS LAST, b.name`,
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

  /**
   * Adds a product. A brand can be created in the same step, because "we have
   * started stocking Mengas" is one decision, not two.
   */
  async createProduct(input: NewProductInput): Promise<ProductVariant> {
    const name = (input.name ?? "").trim();
    if (name.length < 2) throw new ProductError("BAD_NAME", "Give the product a name.");

    const category = await this.findCategory(input.categoryId);
    const brand = await this.resolveBrand(input);

    let sizeKg: number | null = null;
    const rawSize = input.sizeKg;
    if (rawSize !== null && rawSize !== undefined && String(rawSize).trim() !== "") {
      sizeKg = Number(rawSize);
      if (!Number.isFinite(sizeKg) || sizeKg <= 0) {
        throw new ProductError("BAD_SIZE", "A size has to be a number of kilograms above zero.");
      }
    }

    // The same rule the database trigger enforces, said in words a form can show.
    if (category.stockModel === StockModel.Cylinder && sizeKg === null) {
      throw new ProductError(
        "SIZE_REQUIRED",
        `${category.name} are sold by size — say how many kilograms this cylinder holds.`,
      );
    }
    if (category.stockModel !== StockModel.Cylinder && sizeKg !== null) {
      throw new ProductError(
        "SIZE_FORBIDDEN",
        `${category.name} are not weighed, so they cannot have a kilogram size.`,
      );
    }

    const clash = await this.db.query<Row>(
      sizeKg === null
        ? "SELECT name FROM product_variants WHERE brand_id = $1 AND size_kg IS NULL AND code = $2"
        : "SELECT name FROM product_variants WHERE brand_id = $1 AND size_kg = $2",
      sizeKg === null ? [brand.id, slug(name)] : [brand.id, sizeKg],
    );
    if (clash.length > 0) {
      throw new ProductError(
        "DUPLICATE",
        `${brand.name} already has ${str(clash[0].name)} on the list.`,
      );
    }

    let price: number | null = null;
    const rawPrice = input.listPriceKsh;
    if (rawPrice !== null && rawPrice !== undefined && String(rawPrice).trim() !== "") {
      price = Number(rawPrice);
      if (!Number.isFinite(price) || price < 0) {
        throw new ProductError("BAD_PRICE", "A price cannot be negative.");
      }
    }

    const id = newId("var");
    const code =
      sizeKg === null
        ? `${category.code}-${slug(name).slice(0, 24)}`
        : `${category.code}-${slug(brand.code)}-${String(sizeKg).replace(".", "-")}`;

    await this.db.query(
      `INSERT INTO product_variants (id, code, category_id, brand_id, name, size_kg, list_price_ksh)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, code, category.id, brand.id, name, sizeKg, price],
    );

    return {
      id,
      code,
      categoryId: category.id,
      brandId: brand.id,
      name,
      sizeKg,
      listPriceKsh: price,
      active: true,
    };
  }

  private async findCategory(categoryId: string): Promise<Category> {
    const rows = await this.db.query<Row>("SELECT * FROM categories WHERE id = $1", [
      categoryId,
    ]);
    if (rows.length === 0) {
      throw new ProductError("NO_CATEGORY", "Choose a category for this product.");
    }
    return {
      id: str(rows[0].id),
      code: str(rows[0].code),
      name: str(rows[0].name),
      stockModel: str(rows[0].stock_model) as StockModel,
    };
  }

  /** Uses the brand you picked, or creates the one you typed. */
  private async resolveBrand(input: NewProductInput): Promise<Brand> {
    if (input.brandId) {
      const rows = await this.db.query<Row>("SELECT * FROM brands WHERE id = $1", [
        input.brandId,
      ]);
      if (rows.length === 0) throw new ProductError("NO_BRAND", "That brand no longer exists.");
      return {
        id: str(rows[0].id),
        code: str(rows[0].code),
        name: str(rows[0].name),
        depotName: str(rows[0].depot_name),
      };
    }

    const name = (input.newBrandName ?? "").trim();
    if (name.length < 2) {
      throw new ProductError("NO_BRAND", "Pick a brand, or type a new one.");
    }
    const code = slug(name);
    const existing = await this.db.query<Row>("SELECT * FROM brands WHERE code = $1", [code]);
    if (existing.length > 0) {
      return {
        id: str(existing[0].id),
        code: str(existing[0].code),
        name: str(existing[0].name),
        depotName: str(existing[0].depot_name),
      };
    }
    const id = newId("brand");
    await this.db.query(
      "INSERT INTO brands (id, code, name, depot_name) VALUES ($1, $2, $3, $4)",
      [id, code, name, name],
    );
    return { id, code, name, depotName: name };
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
