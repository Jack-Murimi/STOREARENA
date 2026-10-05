import {
  CustomerRepository,
  type Database,
} from "./repository";
import {
  CustomerError,
  DuplicateCodeError,
  DuplicateLabelError,
  DuplicatePhoneError,
  InvalidLabelError,
  InvalidNameError,
  InvalidNotesError,
  InvalidPinError,
  InvalidRoleError,
  NoContactsError,
  NoLocationsError,
  UnknownContactError,
  UnknownCustomerError,
  UnknownCustomerLocationError,
} from "./errors";
import { normalizeKenyanPhone } from "./phone";
import { CustomerKind } from "./types";
import type {
  Customer,
  CustomerContact,
  CustomerLocation,
  CustomerPatch,
  CustomerRecord,
  NewContactInput,
  NewCustomerInput,
  NewLocationInput,
} from "./types";

/** Short unique id with a readable prefix. */
function newId(prefix: string): string {
  const raw =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${raw.replace(/-/g, "").slice(0, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Empty or whitespace becomes null; anything else must be worth reading. */
function optionalText(value: string | null | undefined, min: number): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length < min) {
    throw new InvalidNotesError(value);
  }
  return trimmed;
}

/**
 * Customer CRUD with the rules the business actually runs on:
 *
 * - a customer always has at least one delivery location and one phone number;
 * - one location and one contact are primary (the first is promoted if nobody
 *   is marked);
 * - phone numbers are stored normalised, unique per customer;
 * - a contact's role is optional free text.
 */
export class CustomerService {
  readonly repository: CustomerRepository;

  constructor(private readonly db: Database) {
    this.repository = new CustomerRepository(db);
  }

  // ------------------------------------------------------------------ reads

  async list(options?: { includeInactive?: boolean; search?: string }): Promise<
    CustomerRecord[]
  > {
    const search = options?.search;
    // Someone typing "0722 111 222" into the search box means the customer
    // whose number that is, even though it is stored as +254722111222.
    let phone: string | undefined;
    if (search && search.replace(/\D/g, "").length >= 9) {
      try {
        phone = normalizeKenyanPhone(search);
      } catch {
        // Not a phone number — the text search covers it.
      }
    }
    return this.repository.list({ ...options, phone });
  }

  async get(id: string): Promise<CustomerRecord> {
    const found = await this.repository.get(id);
    if (!found) throw new UnknownCustomerError(id);
    return found;
  }

  /** Every customer this phone number belongs to. */
  async findByPhone(phone: string): Promise<CustomerRecord[]> {
    return this.repository.findByPhone(normalizeKenyanPhone(phone));
  }

  /**
   * A phone number belongs to one account. Checked here for a helpful message
   * naming the account that already has it; the UNIQUE constraint is the real
   * guard if two people save at the same instant.
   */
  private async assertPhoneFree(
    phone: string,
    exceptContactId?: string,
  ): Promise<void> {
    const owner = await this.repository.phoneOwner(phone);
    if (!owner) return;
    if (exceptContactId) {
      const holder = await this.repository.get(owner.id);
      if (holder?.contacts.some((c) => c.id === exceptContactId)) return;
    }
    throw new DuplicatePhoneError(phone, { code: owner.code, name: owner.name });
  }

  // ----------------------------------------------------------------- create

  async create(input: NewCustomerInput): Promise<CustomerRecord> {
    const name = requireText(input.name, "name");
    const notes = optionalText(input.notes, 3);
    const locations = this.prepareLocations(input.locations);
    const contacts = this.prepareContacts(input.contacts);

    // One question for the whole batch, not one per number.
    const taken = await this.repository.phonesTaken(contacts.map((c) => c.phone));
    if (taken.length > 0) {
      throw new DuplicatePhoneError(taken[0].phone, {
        code: taken[0].code,
        name: taken[0].name,
      });
    }

    const id = newId("cus");
    const createdAt = nowIso();
    const customer: Customer = {
      id,
      code: "", // filled in by the INSERT, which counts the book itself
      name,
      kind: input.kind ?? CustomerKind.Household,
      notes,
      active: true,
      createdAt,
      updatedAt: createdAt,
    };

    await this.repository.transaction(async (tx) => {
      await this.repository.insert(customer, tx);
      await this.repository.insertLocations(
        locations.map((l) => ({ ...l, customerId: id })),
        tx,
      );
      await this.repository.insertContacts(
        contacts.map((c) => ({ ...c, customerId: id })),
        tx,
      );
    });

    return this.get(id);
  }

  // ----------------------------------------------------------------- update

  async update(id: string, patch: CustomerPatch): Promise<CustomerRecord> {
    await this.get(id);
    const clean: CustomerPatch = {};
    if (patch.name !== undefined) clean.name = requireText(patch.name, "name");
    if (patch.notes !== undefined) clean.notes = optionalText(patch.notes, 3);
    if (patch.kind !== undefined) clean.kind = patch.kind;
    if (patch.active !== undefined) clean.active = patch.active;

    try {
      await this.repository.updateCustomer(id, clean);
    } catch (error) {
      if (/duplicate key/i.test((error as Error).message)) {
        throw new DuplicateCodeError(clean.name ?? patch.name ?? "");
      }
      throw error;
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.repository.delete(id);
  }

  // -------------------------------------------------------------- locations

  async addLocation(
    customerId: string,
    input: NewLocationInput,
  ): Promise<CustomerRecord> {
    const customer = await this.get(customerId);
    const label = requireLabel(input.label);
    if (
      customer.locations.some(
        (l) => l.label.toLowerCase() === label.toLowerCase(),
      )
    ) {
      throw new DuplicateLabelError(customerId, label);
    }

    const location: CustomerLocation = {
      id: newId("loc"),
      customerId,
      label,
      addressLine: input.addressLine?.trim() || null,
      details: input.details?.trim() || null,
      area: input.area?.trim() || null,
      town: input.town?.trim() || null,
      ...cleanPin(input.pinLat, input.pinLng),
      // First one wins if nobody is marked.
      isPrimary:
        input.isPrimary === true || customer.locations.length === 0
          ? true
          : false,
      active: true,
      createdAt: nowIso(),
    };

    await this.repository.transaction(async (tx) => {
      if (location.isPrimary) {
        await this.repository.clearPrimaryLocation(customerId, tx);
      }
      await this.repository.insertLocation(location, tx);
    });

    return this.get(customerId);
  }

  async updateLocation(
    customerId: string,
    locationId: string,
    patch: Partial<NewLocationInput>,
  ): Promise<CustomerRecord> {
    const customer = await this.get(customerId);
    const existing = customer.locations.find((l) => l.id === locationId);
    if (!existing) throw new UnknownCustomerLocationError(locationId);

    const clean: Partial<CustomerLocation> = {};
    if (patch.label !== undefined) {
      const label = requireLabel(patch.label);
      const clash = customer.locations.find(
        (l) => l.id !== locationId && l.label.toLowerCase() === label.toLowerCase(),
      );
      if (clash) throw new DuplicateLabelError(customerId, label);
      clean.label = label;
    }
    if (patch.addressLine !== undefined) clean.addressLine = patch.addressLine?.trim() || null;
    if (patch.details !== undefined) clean.details = patch.details?.trim() || null;
    if (patch.area !== undefined) clean.area = patch.area?.trim() || null;
    if (patch.town !== undefined) clean.town = patch.town?.trim() || null;
    if (patch.pinLat !== undefined || patch.pinLng !== undefined) {
      Object.assign(clean, cleanPin(patch.pinLat, patch.pinLng));
    }
    if (patch.isPrimary !== undefined) clean.isPrimary = patch.isPrimary;

    await this.repository.transaction(async (tx) => {
      if (clean.isPrimary) {
        await this.repository.clearPrimaryLocation(customerId, tx);
      }
      await this.repository.updateLocation(locationId, clean, tx);
    });

    return this.get(customerId);
  }

  async removeLocation(customerId: string, locationId: string): Promise<CustomerRecord> {
    const customer = await this.get(customerId);
    const existing = customer.locations.find((l) => l.id === locationId);
    if (!existing) throw new UnknownCustomerLocationError(locationId);

    const remaining = customer.locations.filter((l) => l.id !== locationId);
    if (remaining.length === 0) throw new NoLocationsError(customer.name);

    await this.repository.transaction(async (tx) => {
      await this.repository.deleteLocation(locationId, tx);
      // Never leave a customer without a primary address.
      if (existing.isPrimary) {
        await this.repository.updateLocation(remaining[0].id, { isPrimary: true }, tx);
      }
    });

    return this.get(customerId);
  }

  // ---------------------------------------------------------------- contacts

  async addContact(
    customerId: string,
    input: NewContactInput,
  ): Promise<CustomerRecord> {
    const customer = await this.get(customerId);
    const phone = normalizeKenyanPhone(input.phone);
    await this.assertPhoneFree(phone);

    const contact: CustomerContact = {
      id: newId("con"),
      customerId,
      phone,
      name: requireText(input.name, "name"),
      role: optionalRole(input.role),
      isPrimary:
        input.isPrimary === true || customer.contacts.length === 0
          ? true
          : false,
      notes: optionalText(input.notes, 3),
      createdAt: nowIso(),
    };

    await this.repository.transaction(async (tx) => {
      if (contact.isPrimary) {
        await this.repository.clearPrimaryContact(customerId, tx);
      }
      await this.repository.insertContact(contact, tx);
    });

    return this.get(customerId);
  }

  async updateContact(
    customerId: string,
    contactId: string,
    patch: Partial<NewContactInput>,
  ): Promise<CustomerRecord> {
    const customer = await this.get(customerId);
    const existing = customer.contacts.find((c) => c.id === contactId);
    if (!existing) throw new UnknownContactError(contactId);

    const clean: Partial<CustomerContact> = {};
    if (patch.phone !== undefined) {
      const phone = normalizeKenyanPhone(patch.phone);
      await this.assertPhoneFree(phone, contactId);
      clean.phone = phone;
    }
    if (patch.name !== undefined) clean.name = requireText(patch.name, "name");
    if (patch.role !== undefined) clean.role = optionalRole(patch.role);
    if (patch.notes !== undefined) clean.notes = optionalText(patch.notes, 3);
    if (patch.isPrimary !== undefined) clean.isPrimary = patch.isPrimary;

    await this.repository.transaction(async (tx) => {
      if (clean.isPrimary) {
        await this.repository.clearPrimaryContact(customerId, tx);
      }
      await this.repository.updateContact(contactId, clean, tx);
    });

    return this.get(customerId);
  }

  async removeContact(customerId: string, contactId: string): Promise<CustomerRecord> {
    const customer = await this.get(customerId);
    const existing = customer.contacts.find((c) => c.id === contactId);
    if (!existing) throw new UnknownContactError(contactId);

    const remaining = customer.contacts.filter((c) => c.id !== contactId);
    if (remaining.length === 0) throw new NoContactsError(customer.name);

    await this.repository.transaction(async (tx) => {
      await this.repository.deleteContact(contactId, tx);
      if (existing.isPrimary) {
        await this.repository.updateContact(remaining[0].id, { isPrimary: true }, tx);
      }
    });

    return this.get(customerId);
  }

  // ------------------------------------------------------------- internals

  /** Validates a batch of locations and works out who is primary. */
  private prepareLocations(
    inputs: NewLocationInput[],
  ): Omit<CustomerLocation, "customerId">[] {
    if (inputs.length === 0) throw new NoLocationsError();

    const seen = new Set<string>();
    const createdAt = nowIso();

    const prepared = inputs.map((input) => {
      const label = requireLabel(input.label);
      const key = label.toLowerCase();
      if (seen.has(key)) throw new DuplicateLabelError("new customer", label);
      seen.add(key);

      return {
        id: newId("loc"),
        label,
        addressLine: input.addressLine?.trim() || null,
        details: input.details?.trim() || null,
        area: input.area?.trim() || null,
        town: input.town?.trim() || null,
        ...cleanPin(input.pinLat, input.pinLng),
        isPrimary: input.isPrimary === true,
        active: true,
        createdAt,
      };
    });

    return electPrimary(prepared);
  }

  /** Validates a batch of contacts and works out who is primary. */
  private prepareContacts(
    inputs: NewContactInput[],
  ): Omit<CustomerContact, "customerId">[] {
    if (inputs.length === 0) throw new NoContactsError();

    const seen = new Set<string>();
    const createdAt = nowIso();

    const prepared = inputs.map((input) => {
      const phone = normalizeKenyanPhone(input.phone);
      if (seen.has(phone)) throw new DuplicatePhoneError(phone);
      seen.add(phone);

      return {
        id: newId("con"),
        phone,
        name: requireText(input.name, "name"),
        role: optionalRole(input.role),
        isPrimary: input.isPrimary === true,
        notes: optionalText(input.notes, 3),
        createdAt,
      };
    });

    return electPrimary(prepared);
  }
}

// ------------------------------------------------------------- small helpers

/**
 * A map pin is both coordinates or neither. Half a pin is worse than no pin:
 * a rider would be sent to the equator.
 */
function cleanPin(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
): { pinLat: number | null; pinLng: number | null } {
  const parse = (v: number | string | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    const text = String(v).trim();
    if (text.length === 0) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : Number.NaN;
  };

  const pinLat = parse(lat);
  const pinLng = parse(lng);

  if (pinLat === null && pinLng === null) return { pinLat: null, pinLng: null };
  if (
    pinLat === null || pinLng === null ||
    Number.isNaN(pinLat) || Number.isNaN(pinLng) ||
    pinLat < -90 || pinLat > 90 || pinLng < -180 || pinLng > 180
  ) {
    throw new InvalidPinError(lat, lng);
  }
  return { pinLat, pinLng };
}

/**
 * Exactly one row must be primary. Whoever is marked wins (the first of them if
 * several are), and if nobody is marked the first row takes it — a customer
 * with no main address or main number is not deliverable.
 */
function electPrimary<T extends { isPrimary: boolean }>(rows: T[]): T[] {
  const marked = rows.filter((r) => r.isPrimary);
  const winner = marked.length > 0 ? marked[0] : rows[0];
  return rows.map((row) => ({ ...row, isPrimary: row === winner }));
}

function requireText(value: string, what: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length < 2) throw new InvalidNameError(value ?? "", what);
  return trimmed;
}

function requireLabel(value: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length < 2) throw new InvalidLabelError(value ?? "");
  return trimmed;
}

/** A role is optional, but if you write one it must mean something. */
function optionalRole(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length < 2) throw new InvalidRoleError(value);
  return trimmed;
}

export { CustomerError };
