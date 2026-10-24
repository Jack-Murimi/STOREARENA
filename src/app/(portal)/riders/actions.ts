"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCustomerContext } from "@/lib/db";
import { currentStaffAccess } from "@/lib/auth";

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

/** Riders are people, not branch stock locations. */
export async function createRider(form: FormData): Promise<void> {
  const staff = await currentStaffAccess();
  if (!staff) destination("Sign in is required.");
  const name = clean(form, "name");
  const phone = clean(form, "phone");
  if (name.length < 2) destination("Enter the rider’s full name.", "?new=1");
  if (phone.length < 7) destination("Enter a valid phone number.", "?new=1");

  const db = await riderDatabase();
  try {
    await db.query(
      "insert into riders (name, phone, is_active) values ($1, $2, true)",
      [name, phone],
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
  const staff = await currentStaffAccess();
  if (!staff) destination("Sign in is required.");
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
