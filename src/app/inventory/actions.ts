"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProductError } from "@/lib/stock/products";
import type { ProductService } from "@/lib/stock/products";
import { StockError } from "@/lib/stock/stock-db";
import type { StockLedgerService } from "@/lib/stock/stock-db";
import { LocationKind } from "@/lib/stock/types";
import { getCustomerContext } from "@/lib/db";
import { authenticatedStaff } from "@/lib/auth";

const text = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();

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

/** Creates a selectable category, including whether it is a cylinder lifecycle. */
export async function createCategory(form: FormData): Promise<void> {
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

/** Adds a product to the catalogue. A brand can be created in the same step. */
export async function createProduct(form: FormData): Promise<void> {
  const products = await requireProducts();

  let names: string[] = [];
  const isFirstCatalogueEntry = (await products.listInventory()).length === 0;
  try {
    const created = await products.createProducts({
      name: text(form, "name") || null,
      categoryId: text(form, "categoryId"),
      brandId: text(form, "brandId") || null,
      newBrandName: text(form, "newBrandName") || null,
      sizeKgs: text(form, "sizeKgs") || null,
      listPriceKsh: text(form, "listPriceKsh") || null,
    });
    names = created.map((product) => product.name);
  } catch (error) {
    fail(error, "/inventory?new=1");
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
  const { stock } = await getCustomerContext();
  const backTo = "/inventory?opening=1";
  if (!stock) fail(new Error("No database connection. Set DATABASE_URL and redeploy."), backTo);

  const staff = await authenticatedStaff();
  if (!staff) fail(new StockError("NO_ACTOR", "Your signed-in staff profile is required."), backTo);

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
      actor: staff.name,
      reference: text(form, "reference") || null,
      occurredOn: text(form, "occurredOn") || null,
    });
    revalidatePath("/inventory");
    redirect(
      withMessage(
        "/inventory",
        "saved",
        `Opening stock saved for ${result.entries} branch-product entries: ${result.refills} refills and ${result.empties} empties.`,
      ),
    );
  } catch (error) {
    fail(error, backTo);
  }
}

/** Adds a branch, or a rider van that belongs to one. */
export async function createLocation(form: FormData): Promise<void> {
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

  try {
    await (stock as StockLedgerService).recordPurchase({
      locationId: text(form, "locationId"),
      variantId,
      quantity: text(form, "quantity"),
      unitCostKsh: text(form, "unitCostKsh"),
      purchasedOn: text(form, "purchasedOn") || null,
      reference: text(form, "reference") || null,
      actor: text(form, "actor"),
    });
  } catch (error) {
    fail(error, backTo);
  }

  revalidatePath(backTo);
  revalidatePath("/inventory");
  redirect(`${backTo}?saved=${encodeURIComponent("Delivery received and costed.")}`);
}
