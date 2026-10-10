"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";

const clean = (form: FormData, field: string): string => {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
};

function destination(message: string, query = ""): never {
  redirect(`/riders${query}${query ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

async function riderDatabase() {
  const { products } = await getCustomerContext();
  if (!products) destination("The database is unavailable. Rider changes cannot be saved.");
  return products.db;
}

/** Adds a rider to one branch. No rider stock location is created: branch stock
 * stays branch stock, and a rider is simply a delivery assignment. */
export async function createRider(form: FormData): Promise<void> {
  const name = clean(form, "name");
  const phone = clean(form, "phone");
  const branchId = clean(form, "branch_id");
  if (name.length < 2) destination("Enter the rider’s full name.", "?new=1");
  if (phone.length < 7) destination("Enter a valid phone number.", "?new=1");
  if (!branchId) destination("Choose the rider’s branch.", "?new=1");

  const db = await riderDatabase();
  const branch = await db.query<{ id: string }>(
    "select id from stock_locations where id = $1 and kind = 'BRANCH' and active",
    [branchId],
  );
  if (!branch[0]) destination("Choose an active branch for this rider.", "?new=1");
  try {
    await db.query(
      "insert into riders (name, phone, branch_id, is_active) values ($1, $2, $3, true)",
      [name, phone, branchId],
    );
  } catch (error) {
    const message = (error as Error).message;
    destination(message.includes("riders_phone_key") ? "That phone number is already assigned to a rider." : "Could not create the rider.", "?new=1");
  }

  revalidatePath("/riders");
  redirect(`/riders?saved=${encodeURIComponent(`${name} is ready for delivery assignments.`)}`);
}

/** Riders remain in history forever. Changing active status only controls
 * whether POS can assign future deliveries; it never removes past receipts. */
export async function setRiderActive(form: FormData): Promise<void> {
  const id = clean(form, "id");
  const active = clean(form, "active") === "true";
  if (!id) destination("Choose a rider to update.");

  const db = await riderDatabase();
  let rows: { name: string }[];
  try {
    rows = await db.query<{ name: string }>(
      "update riders set is_active = $2, updated_at = now() where id = $1 and is_active is distinct from $2 returning name",
      [id, active],
    );
  } catch (error) {
    destination(`Could not update the rider: ${(error as Error).message}`);
  }
  if (!rows[0]) destination(`That rider is already ${active ? "active" : "inactive"} or could not be found.`);
  revalidatePath("/riders");
  const status = active ? "reactivated and is available for new delivery assignments" : "deactivated; their delivery history remains available";
  redirect(`/riders?saved=${encodeURIComponent(`${rows[0].name} was ${status}.`)}`);
}
