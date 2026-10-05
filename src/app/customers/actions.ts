"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BillingError } from "@/lib/billing";
import type { BillingService } from "@/lib/billing";
import { CustomerError, CustomerKind } from "@/lib/customers";
import type { NewContactInput, NewLocationInput } from "@/lib/customers";
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

/**
 * Reads the repeatable rows the new-customer form posts (`loc_label_0`,
 * `loc_label_1`, …). Rows left blank are skipped rather than refused, so a
 * stray extra row is harmless.
 */
function readLocations(form: FormData): NewLocationInput[] {
  const rows: NewLocationInput[] = [];
  for (let i = 0; form.has(`loc_label_${i}`); i += 1) {
    const label = text(form, `loc_label_${i}`).trim();
    if (label.length === 0) continue;
    rows.push({
      label,
      addressLine: optional(form, `loc_address_${i}`),
      details: optional(form, `loc_details_${i}`),
    });
  }
  return rows;
}

function readContacts(form: FormData): NewContactInput[] {
  const rows: NewContactInput[] = [];
  for (let i = 0; form.has(`con_name_${i}`); i += 1) {
    const name = text(form, `con_name_${i}`).trim();
    const phone = text(form, `con_phone_${i}`).trim();
    if (name.length === 0 && phone.length === 0) continue;
    rows.push({
      name,
      phone,
      role: optional(form, `con_role_${i}`),
      isPrimary: i === 0,
    });
  }
  return rows;
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
  if (error instanceof BillingError) {
    redirect(`${backTo}${backTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }
  const message =
    error instanceof CustomerError
      ? error.message
      : `Something went wrong: ${(error as Error).message}`;
  // The target may already carry a query (?new=1); don't stack a second "?".
  const joiner = backTo.includes("?") ? "&" : "?";
  redirect(`${backTo}${joiner}error=${encodeURIComponent(message)}`);
}

// ------------------------------------------------------------------ customer

export async function createCustomer(form: FormData): Promise<void> {
  const service = await requireService("/customers");

  let name: string;
  try {
    const created = await service.create({
      name: text(form, "name"),
      kind: kindFrom(form),
      notes: optional(form, "notes"),
      locations: readLocations(form),
      contacts: readContacts(form),
    });
    name = created.name;
  } catch (error) {
    fail(error, "/customers?new=1");
  }

  revalidatePath("/customers");
  redirect(`/customers?saved=${encodeURIComponent(`Saved. ${name} is on the list.`)}`);
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
      details: optional(form, "details"),
      area: optional(form, "area"),
      town: optional(form, "town"),
      pinLat: optional(form, "pinLat"),
      pinLng: optional(form, "pinLng"),
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
      details: optional(form, "details"),
      area: optional(form, "area"),
      town: optional(form, "town"),
      pinLat: optional(form, "pinLat"),
      pinLng: optional(form, "pinLng"),
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

// ------------------------------------------------------------------- billing

async function requireBilling(backTo: string): Promise<BillingService> {
  const { billing } = await getCustomerContext();
  if (!billing) {
    fail(
      new Error("No database connection. Set DATABASE_URL and redeploy."),
      backTo,
    );
  }
  return billing;
}

/** Raises an invoice. Lines come in as groups of `line_description_N` etc. */
export async function raiseInvoice(form: FormData): Promise<void> {
  const customerId = text(form, "customerId");
  const backTo = `/customers/${customerId}`;
  const billing = await requireBilling(backTo);

  const lines: { description: string; quantity: string; unitPrice: string }[] = [];
  for (let i = 0; form.has(`line_description_${i}`); i += 1) {
    const description = text(form, `line_description_${i}`);
    const quantity = text(form, `line_quantity_${i}`);
    const unitPrice = text(form, `line_price_${i}`);
    if (!description && !quantity && !unitPrice) continue; // a blank spare row
    lines.push({ description, quantity, unitPrice });
  }

  let reference = "";
  try {
    const invoice = await billing.raiseInvoice({
      customerId,
      issuedOn: optional(form, "issuedOn"),
      notes: optional(form, "notes"),
      lines,
    });
    reference = invoice.reference;
  } catch (error) {
    fail(error, backTo);
  }

  revalidatePath(backTo);
  revalidatePath("/customers");
  redirect(`${backTo}?saved=${encodeURIComponent(`Invoice ${reference} raised.`)}`);
}

/** Records money coming in and spreads it over the oldest invoices. */
export async function recordPayment(form: FormData): Promise<void> {
  const customerId = text(form, "customerId");
  const backTo = `/customers/${customerId}`;
  const billing = await requireBilling(backTo);

  let amount = 0;
  try {
    const payment = await billing.recordPayment({
      customerId,
      amount: text(form, "amount"),
      method: text(form, "method"),
      reference: optional(form, "reference"),
      receivedOn: optional(form, "receivedOn"),
      notes: optional(form, "notes"),
    });
    amount = payment.amount;
  } catch (error) {
    fail(error, backTo);
  }

  revalidatePath(backTo);
  revalidatePath("/customers");
  redirect(
    `${backTo}?saved=${encodeURIComponent(
      `Payment of KSh ${amount.toLocaleString("en-KE")} recorded.`,
    )}`,
  );
}

export async function cancelInvoice(form: FormData): Promise<void> {
  const customerId = text(form, "customerId");
  const backTo = `/customers/${customerId}`;
  const billing = await requireBilling(backTo);

  try {
    await billing.cancelInvoice(text(form, "invoiceId"));
  } catch (error) {
    fail(error, backTo);
  }

  revalidatePath(backTo);
  revalidatePath("/customers");
  redirect(`${backTo}?saved=${encodeURIComponent("Invoice cancelled.")}`);
}
