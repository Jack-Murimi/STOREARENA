"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProductError } from "@/lib/stock/products";
import type { ProductService } from "@/lib/stock/products";
import { LocationKind } from "@/lib/stock/types";
import { getCustomerContext } from "@/lib/db";

const text = (form: FormData, key: string): string => String(form.get(key) ?? "").trim();

function fail(error: unknown): never {
  const message =
    error instanceof ProductError
      ? error.message
      : "That could not be saved. Check the details and try again.";
  redirect(`/inventory?error=${encodeURIComponent(message)}`);
}

async function requireProducts(): Promise<ProductService> {
  const { products } = await getCustomerContext();
  if (!products) {
    fail(new Error("No database connection. Set DATABASE_URL and redeploy."));
  }
  return products;
}

/** Adds a product to the catalogue. A brand can be created in the same step. */
export async function createProduct(form: FormData): Promise<void> {
  const products = await requireProducts();

  let name = "";
  try {
    const created = await products.createProduct({
      name: text(form, "name"),
      categoryId: text(form, "categoryId"),
      brandId: text(form, "brandId") || null,
      newBrandName: text(form, "newBrandName") || null,
      sizeKg: text(form, "sizeKg") || null,
      listPriceKsh: text(form, "listPriceKsh") || null,
    });
    name = created.name;
  } catch (error) {
    fail(error);
  }

  revalidatePath("/inventory");
  redirect(`/inventory?saved=${encodeURIComponent(`${name} added to the catalogue.`)}`);
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
