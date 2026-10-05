import type { Brand, Category, ProductVariant } from "./types";
import {
  DuplicateCodeError,
  InvalidVariantShapeError,
  UnknownEntityError,
} from "./errors";
import { StockModel } from "./types";

/**
 * Reference data: categories, brands, and the variants that sit at their
 * intersection. Treated as immutable once seeded — reference data changes are
 * an administrative operation, not a stock movement.
 */
export class Catalog {
  private readonly categories = new Map<string, Category>();
  private readonly brands = new Map<string, Brand>();
  private readonly variants = new Map<string, ProductVariant>();

  addCategory(category: Category): this {
    if ([...this.categories.values()].some((c) => c.code === category.code)) {
      throw new DuplicateCodeError("category", category.code);
    }
    this.categories.set(category.id, { ...category });
    return this;
  }

  addBrand(brand: Brand): this {
    if ([...this.brands.values()].some((b) => b.code === brand.code)) {
      throw new DuplicateCodeError("brand", brand.code);
    }
    this.brands.set(brand.id, { ...brand });
    return this;
  }

  addVariant(variant: ProductVariant): this {
    if ([...this.variants.values()].some((v) => v.code === variant.code)) {
      throw new DuplicateCodeError("variant", variant.code);
    }
    const category = this.requireCategory(variant.categoryId);
    this.requireBrand(variant.brandId);

    if (category.stockModel === StockModel.Cylinder) {
      if (typeof variant.sizeKg !== "number" || variant.sizeKg <= 0) {
        throw new InvalidVariantShapeError(
          variant.id,
          "cylinder variants must declare a positive sizeKg",
        );
      }
    } else if (variant.sizeKg !== null) {
      throw new InvalidVariantShapeError(
        variant.id,
        "non-cylinder variants must not declare sizeKg",
      );
    }

    this.variants.set(variant.id, { ...variant });
    return this;
  }

  category(id: string): Category | undefined {
    return this.categories.get(id);
  }

  requireCategory(id: string): Category {
    const found = this.categories.get(id);
    if (!found) throw new UnknownEntityError("category", id);
    return found;
  }

  brand(id: string): Brand | undefined {
    return this.brands.get(id);
  }

  requireBrand(id: string): Brand {
    const found = this.brands.get(id);
    if (!found) throw new UnknownEntityError("brand", id);
    return found;
  }

  variant(id: string): ProductVariant | undefined {
    return this.variants.get(id);
  }

  requireVariant(id: string): ProductVariant {
    const found = this.variants.get(id);
    if (!found) throw new UnknownEntityError("variant", id);
    return found;
  }

  listCategories(): Category[] {
    return [...this.categories.values()];
  }

  listBrands(): Brand[] {
    return [...this.brands.values()];
  }

  listVariants(): ProductVariant[] {
    return [...this.variants.values()];
  }

  variantsOfBrand(brandId: string): ProductVariant[] {
    return this.listVariants().filter((v) => v.brandId === brandId);
  }

  /** Counter lookup: "AFRIGAS", 13 -> the Afri Gas 13 kg variant. */
  findVariant(brandCode: string, sizeKg: number): ProductVariant | undefined {
    const brand = [...this.brands.values()].find((b) => b.code === brandCode);
    if (!brand) return undefined;
    return this.listVariants().find(
      (v) => v.brandId === brand.id && v.sizeKg === sizeKg,
    );
  }
}
