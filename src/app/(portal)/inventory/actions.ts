"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProductError } from "@/lib/stock/products";
import type { ProductService } from "@/lib/stock/products";
import { StockError } from "@/lib/stock/stock-db";
import type { StockLedgerService } from "@/lib/stock/stock-db";
import { LocationKind } from "@/lib/stock/types";
import { getCustomerContext } from "@/lib/db";
import {
  canManageCatalogue,
  canReceiveStock,
  currentStaffAccess,
  type StaffAccess,
} from "@/lib/auth";

const text = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();

function sizePrices(form: FormData): Record<string, string> | null {
  const raw = text(form, "sizePrices");
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("not an object");
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([size, price]) => [size, String(price ?? "")]),
    );
  } catch {
    throw new ProductError("BAD_PRICE", "The prices for the selected cylinder sizes could not be read. Try again.");
  }
}

function withMessage(backTo: string, key: "saved" | "error", message: string): string {
  const url = new URL(backTo, "http://portal.local");
  url.searchParams.set(key, message);
  return `${url.pathname}${url.search}`;
}

function fail(error: unknown, backTo = "/inventory"): never {
  const message =
    error instanceof ProductError || error instanceof StockError
      ? error.message
      : "That could not be saved. Check the details and try again.";
  redirect(withMessage(backTo, "error", message));
}

async function requireProducts(): Promise<ProductService> {
  const { products } = await getCustomerContext();
  if (!products) {
    fail(new Error("No database connection. Set DATABASE_URL and redeploy."));
  }
  return products;
}

async function requireCatalogueAccess(backTo: string): Promise<StaffAccess> {
  const staff = await currentStaffAccess();
  if (!staff) fail(new StockError("NO_ACTOR", "Your signed-in staff profile is required."), backTo);
  if (!canManageCatalogue(staff)) {
    fail(new StockError("FORBIDDEN", "Only an Admin or Director can manage the catalogue."), backTo);
  }
  return staff;
}

async function requireReceiptAccess(locationId: string, backTo: string): Promise<StaffAccess> {
  const staff = await currentStaffAccess();
  if (!staff) fail(new StockError("NO_ACTOR", "Your signed-in staff profile is required."), backTo);
  if (!canReceiveStock(staff, locationId)) {
    fail(
      new StockError("FORBIDDEN", "You can only receive stock at a branch assigned to you."),
      backTo,
    );
  }
  return staff;
}

/** Creates a selectable category, including whether it is a cylinder lifecycle. */
export async function createCategory(form: FormData): Promise<void> {
  await requireCatalogueAccess("/inventory?new=1&createCategory=1");
  const products = await requireProducts();

  let categoryId = "";
  let name = "";
  try {
    const created = await products.createCategory({
      name: text(form, "categoryName"),
      stockModel: text(form, "stockModel"),
    });
    categoryId = created.id;
    name = created.name;
  } catch (error) {
    fail(error, "/inventory?new=1&createCategory=1");
  }

  revalidatePath("/inventory");
  redirect(
    withMessage(
      `/inventory?new=1&newCategory=${encodeURIComponent(categoryId)}`,
      "saved",
      `${name} is ready. Now add its first product.`,
    ),
  );
}

export type CreateProductState = {
  error?: string;
  field?: "category" | "brand" | "name" | "size" | "price" | "product";
};

const productErrorField = (error: unknown): CreateProductState["field"] => {
  if (!(error instanceof ProductError)) return "product";
  if (error.code.includes("SIZE")) return "size";
  if (error.code === "BAD_PRICE") return "price";
  if (error.code.includes("BRAND")) return "brand";
  if (error.code === "BAD_NAME") return "name";
  if (error.code.includes("CATEGORY")) return "category";
  return "product";
};

/**
 * Adds a product while returning validation errors to the progressive client
 * form, so a bad price or duplicate does not discard the entry in progress.
 * A successful creation redirects into the normal catalogue flow.
 */
export async function createProductState(
  _previous: CreateProductState,
  form: FormData,
): Promise<CreateProductState> {
  const staff = await currentStaffAccess();
  if (!staff) return { error: "Your signed-in staff profile is required.", field: "product" };
  if (!canManageCatalogue(staff)) {
    return { error: "Only an Admin or Director can manage the catalogue.", field: "product" };
  }

  const { products } = await getCustomerContext();
  if (!products) return { error: "No database connection. Set DATABASE_URL and redeploy.", field: "product" };

  const isFirstCatalogueEntry = (await products.listInventory()).length === 0;
  let names: string[];
  try {
    const created = await products.createProducts({
      name: text(form, "name") || null,
      categoryId: text(form, "categoryId"),
      brandId: text(form, "brandId") || null,
      newBrandName: text(form, "newBrandName") || null,
      sizeKgs: text(form, "sizeKgs") || null,
      sizePrices: sizePrices(form),
      listPriceKsh: text(form, "listPriceKsh") || null,
    });
    names = created.map((product) => product.name);
  } catch (error) {
    return {
      error: error instanceof ProductError ? error.message : "That could not be saved. Check the details and try again.",
      field: productErrorField(error),
    };
  }

  const message =
    names.length === 1
      ? `${names[0]} added to the catalogue.`
      : `${names.length} products added: ${names.join(", ")}.`;
  revalidatePath("/inventory");
  redirect(withMessage(isFirstCatalogueEntry ? "/inventory?opening=1" : "/inventory", "saved", message));
}

/**
 * Records all first-count values through one stock-ledger transaction. The
 * actor is always the signed-in staff profile, never a name supplied by the
 * browser.
 */
export async function saveOpeningStock(form: FormData): Promise<void> {
  const backTo = "/inventory?opening=1";
  const staff = await requireCatalogueAccess(backTo);
  const { stock } = await getCustomerContext();
  if (!stock) fail(new Error("No database connection. Set DATABASE_URL and redeploy."), backTo);

  let savedUrl = "";
  try {
    const rawEntries = text(form, "entries");
    const entries: unknown = JSON.parse(rawEntries);
    if (!Array.isArray(entries)) {
      throw new StockError("BAD_OPENING_STOCK", "Opening-stock entries were not recognised. Try again.");
    }
    const result = await (stock as StockLedgerService).recordOpeningStock({
      entries: entries as Array<{
        locationId: string;
        variantId: string;
        refills: string | number | null;
        empties: string | number | null;
        unitCostKsh: string | number | null;
      }>,
      actor: staff.fullName,
      reference: text(form, "reference") || null,
      occurredOn: text(form, "occurredOn") || null,
    });
    revalidatePath("/inventory");
    savedUrl = withMessage(
      "/inventory",
      "saved",
      `Opening stock saved for ${result.entries} branch-product entries: ${result.refills} refills and ${result.empties} empties.`,
    );
  } catch (error) {
    fail(error, backTo);
  }
  redirect(savedUrl);
}

/** Adds a branch, or a rider van that belongs to one. */
export async function createLocation(form: FormData): Promise<void> {
  await requireCatalogueAccess("/inventory");
  const products = await requireProducts();

  let name = "";
  try {
    const created = await products.createLocation({
      name: text(form, "name"),
      code: text(form, "code"),
      kind: text(form, "kind") === "VAN" ? LocationKind.Van : LocationKind.Branch,
      homeLocationId: text(form, "homeLocationId") || null,
      rider: text(form, "rider") || null,
    });
    name = created.name;
  } catch (error) {
    fail(error);
  }

  revalidatePath("/inventory");
  redirect(`/inventory?saved=${encodeURIComponent(`${name} added.`)}`);
}

/** Records a delivery from the depot: a batch of cylinders at a price. */
export async function receiveStock(form: FormData): Promise<void> {
  const { stock } = await getCustomerContext();
  if (!stock) fail(new Error("No database connection. Set DATABASE_URL and redeploy."));

  const variantId = text(form, "variantId");
  const backTo = `/inventory/${variantId}`;
  const locationId = text(form, "locationId");
  const staff = await requireReceiptAccess(locationId, backTo);

  try {
    await (stock as StockLedgerService).recordPurchase({
      locationId,
      variantId,
      quantity: text(form, "quantity"),
      unitCostKsh: text(form, "unitCostKsh"),
      purchasedOn: text(form, "purchasedOn") || null,
      reference: text(form, "reference") || null,
      actor: staff.fullName,
      idempotencyKey: text(form, "idempotencyKey") || null,
    });
  } catch (error) {
    fail(error, backTo);
  }

  revalidatePath(backTo);
  revalidatePath("/inventory");
  redirect(`${backTo}?saved=${encodeURIComponent("Delivery received and costed.")}`);
}

/** Updates product name and/or selling price. */
export async function updateProduct(form: FormData): Promise<void> {
  const id = text(form, "id");
  const backTo = `/inventory/${id}`;
  await requireCatalogueAccess(backTo);
  const products = await requireProducts();

  const name = text(form, "name");
  const listPriceKsh = text(form, "listPriceKsh");

  try {
    await products.updateProduct(id, {
      name,
      listPriceKsh: listPriceKsh || null,
    });
    revalidatePath("/inventory");
    revalidatePath(backTo);
  } catch (error) {
    fail(error, backTo);
  }

  redirect(withMessage(backTo, "saved", "Product updated."));
}
