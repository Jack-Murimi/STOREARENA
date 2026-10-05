"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CustomerError, CustomerKind } from "@/lib/customers";
import type { CustomerService } from "@/lib/customers";
import { getCustomerContext } from "@/lib/db";

/**
 * Customer CRUD, driven straight from the forms.
 *
 * Every rule lives in `CustomerService`; these functions only translate form
 * data into a call and turn a refusal into a message the page can show.
 */

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function optional(form: FormData, key: string): string | null {
  const value = text(form, key).trim();
  return value.length > 0 ? value : null;
}

function checked(form: FormData, key: string): boolean {
  return form.get(key) === "on";
}

function kindFrom(form: FormData): CustomerKind {
  return text(form, "kind") === CustomerKind.Business
    ? CustomerKind.Business
    : CustomerKind.Household;
}

/**
 * The service, or a redirect explaining that there is no database. A missing
 * DATABASE_URL must produce a message, never a crashed function.
 */
async function requireService(backTo: string): Promise<CustomerService> {
  const { service } = await getCustomerContext();
  if (!service) {
    fail(
      new Error("No database connection. Set DATABASE_URL and redeploy."),
      backTo,
    );
  }
  return service;
}

/** Sends the visitor back with the reason a change was refused. */
function fail(error: unknown, backTo: string): never {
  const message =
    error instanceof CustomerError
      ? error.message
      : `Something went wrong: ${(error as Error).message}`;
  redirect(`${backTo}?error=${encodeURIComponent(message)}`);
}

// ------------------------------------------------------------------ customer

export async function createCustomer(form: FormData): Promise<void> {
  const service = await requireService("/customers");

  let id: string;
  try {
    const created = await service.create({
      name: text(form, "name"),
      kind: kindFrom(form),
      notes: optional(form, "notes"),
      locations: [
        {
          label: text(form, "locationLabel"),
          addressLine: optional(form, "locationAddress"),
          area: optional(form, "locationArea"),
          town: optional(form, "locationTown"),
          isPrimary: true,
        },
      ],
      contacts: [
        {
          phone: text(form, "contactPhone"),
          name: text(form, "contactName"),
          role: optional(form, "contactRole"),
          isPrimary: true,
        },
      ],
    });
    id = created.id;
  } catch (error) {
    fail(error, "/customers?new=1");
  }

  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export async function updateCustomer(form: FormData): Promise<void> {
  const service = await requireService("/customers");
  const id = text(form, "id");

  try {
    await service.update(id, {
      name: text(form, "name"),
      kind: kindFrom(form),
      notes: optional(form, "notes"),
      active: checked(form, "active"),
    });
  } catch (error) {
    fail(error, `/customers/${id}`);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?saved=Customer+details+updated`);
}

export async function deleteCustomer(form: FormData): Promise<void> {
  const service = await requireService("/customers");
  const id = text(form, "id");

  try {
    await service.remove(id);
  } catch (error) {
    fail(error, `/customers/${id}`);
  }

  revalidatePath("/customers");
  redirect("/customers?deleted=1");
}

// ----------------------------------------------------------------- locations

export async function addLocation(form: FormData): Promise<void> {
  const service = await requireService("/customers");
  const id = text(form, "customerId");

  try {
    await service.addLocation(id, {
      label: text(form, "label"),
      addressLine: optional(form, "addressLine"),
      area: optional(form, "area"),
      town: optional(form, "town"),
      isPrimary: checked(form, "isPrimary"),
    });
  } catch (error) {
    fail(error, `/customers/${id}`);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?saved=Delivery+location+added`);
}

export async function updateLocation(form: FormData): Promise<void> {
  const service = await requireService("/customers");
  const id = text(form, "customerId");
  const locationId = text(form, "locationId");

  try {
    await service.updateLocation(id, locationId, {
      label: text(form, "label"),
      addressLine: optional(form, "addressLine"),
      area: optional(form, "area"),
      town: optional(form, "town"),
      isPrimary: checked(form, "isPrimary"),
    });
  } catch (error) {
    fail(error, `/customers/${id}`);
  }

  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?saved=Delivery+location+updated`);
}

export async function removeLocation(form: FormData): Promise<void> {
  const service = await requireService("/customers");
  const id = text(form, "customerId");

  try {
    await service.removeLocation(id, text(form, "locationId"));
  } catch (error) {
    fail(error, `/customers/${id}`);
  }

  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?saved=Delivery+location+removed`);
}

// ------------------------------------------------------------------ contacts

export async function addContact(form: FormData): Promise<void> {
  const service = await requireService("/customers");
  const id = text(form, "customerId");

  try {
    await service.addContact(id, {
      phone: text(form, "phone"),
      name: text(form, "name"),
      role: optional(form, "role"),
      notes: optional(form, "notes"),
      isPrimary: checked(form, "isPrimary"),
    });
  } catch (error) {
    fail(error, `/customers/${id}`);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?saved=Contact+added`);
}

export async function updateContact(form: FormData): Promise<void> {
  const service = await requireService("/customers");
  const id = text(form, "customerId");
  const contactId = text(form, "contactId");

  try {
    await service.updateContact(id, contactId, {
      phone: text(form, "phone"),
      name: text(form, "name"),
      role: optional(form, "role"),
      notes: optional(form, "notes"),
      isPrimary: checked(form, "isPrimary"),
    });
  } catch (error) {
    fail(error, `/customers/${id}`);
  }

  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?saved=Contact+updated`);
}

export async function removeContact(form: FormData): Promise<void> {
  const service = await requireService("/customers");
  const id = text(form, "customerId");

  try {
    await service.removeContact(id, text(form, "contactId"));
  } catch (error) {
    fail(error, `/customers/${id}`);
  }

  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?saved=Contact+removed`);
}
