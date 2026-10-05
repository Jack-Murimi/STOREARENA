import type {
  Customer,
  CustomerContact,
  CustomerLocation,
  CustomerPatch,
  CustomerRecord,
} from "./types";
import { CustomerKind } from "./types";

/** A row as the database returns it. */
export type Row = Record<string, unknown>;

/**
 * The smallest database surface this module needs.
 *
 * The exact same SQL runs in tests (PGlite — real PostgreSQL compiled to
 * WebAssembly) and in the app (postgres.js against Supabase), so a query that
 * passes here is a query that works there.
 */
export interface Database {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
}

// --------------------------------------------------------------- row mapping

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);
const bool = (v: unknown): boolean => v === true || v === "t" || v === "true";
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

function toCustomer(row: Row): Customer {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    kind: row.kind === CustomerKind.Business ? CustomerKind.Business : CustomerKind.Household,
    notes: strOrNull(row.notes),
    active: bool(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toLocation(row: Row): CustomerLocation {
  return {
    id: str(row.id),
    customerId: str(row.customer_id),
    label: str(row.label),
    addressLine: strOrNull(row.address_line),
    details: strOrNull(row.details),
    area: strOrNull(row.area),
    town: strOrNull(row.town),
    pinLat: numOrNull(row.pin_lat),
    pinLng: numOrNull(row.pin_lng),
    isPrimary: bool(row.is_primary),
    active: bool(row.active),
    createdAt: String(row.created_at),
  };
}

function toContact(row: Row): CustomerContact {
  return {
    id: str(row.id),
    customerId: str(row.customer_id),
    phone: str(row.phone),
    name: str(row.name),
    role: strOrNull(row.role),
    isPrimary: bool(row.is_primary),
    notes: strOrNull(row.notes),
    createdAt: String(row.created_at),
  };
}

/** Persists customers. Knows SQL; does not know business rules. */
export class CustomerRepository {
  constructor(private readonly db: Database) {}

  /** Every customer with their locations and contacts, primary first. */
  async list(
    options: {
      includeInactive?: boolean;
      search?: string;
      /** Canonical phone to match, already normalised by the service. */
      phone?: string;
    } = {},
  ): Promise<CustomerRecord[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];

    if (!options.includeInactive) {
      params.push(true);
      clauses.push(`c.active = $${params.length}`);
    }
    // A search box matches a name, a code, a person or a number — any of them.
    const matches: string[] = [];
    if (options.search && options.search.trim()) {
      params.push(`%${options.search.trim().toLowerCase()}%`);
      const like = `$${params.length}`;
      matches.push(`lower(c.name) LIKE ${like} OR lower(c.code) LIKE ${like}
        OR EXISTS (SELECT 1 FROM customer_contacts ct
                    WHERE ct.customer_id = c.id AND lower(ct.name) LIKE ${like})`);
    }
    if (options.phone) {
      params.push(options.phone);
      matches.push(`EXISTS (SELECT 1 FROM customer_contacts ct
                             WHERE ct.customer_id = c.id AND ct.phone = $${params.length})`);
    }
    if (matches.length > 0) {
      clauses.push(`(${matches.join(" OR ")})`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const customers = await this.db.query<Row>(
      `SELECT * FROM customers c ${where} ORDER BY c.code`,
      params,
    );
    if (customers.length === 0) return [];

    const locations = await this.db.query<Row>(
      `SELECT * FROM customer_locations ORDER BY is_primary DESC, label`,
    );
    const contacts = await this.db.query<Row>(
      `SELECT * FROM customer_contacts ORDER BY is_primary DESC, name`,
    );

    return customers.map((row) => {
      const customer = toCustomer(row);
      return {
        ...customer,
        locations: locations
          .filter((l) => String(l.customer_id) === customer.id)
          .map(toLocation),
        contacts: contacts
          .filter((l) => String(l.customer_id) === customer.id)
          .map(toContact),
      };
    });
  }

  async get(id: string): Promise<CustomerRecord | null> {
    const rows = await this.db.query<Row>(
      "SELECT * FROM customers WHERE id = $1",
      [id],
    );
    if (rows.length === 0) return null;

    const customer = toCustomer(rows[0]);
    const [locations, contacts] = await Promise.all([
      this.db.query<Row>(
        `SELECT * FROM customer_locations WHERE customer_id = $1
          ORDER BY is_primary DESC, label`,
        [id],
      ),
      this.db.query<Row>(
        `SELECT * FROM customer_contacts WHERE customer_id = $1
          ORDER BY is_primary DESC, name`,
        [id],
      ),
    ]);

    return {
      ...customer,
      locations: locations.map(toLocation),
      contacts: contacts.map(toContact),
    };
  }

  /** "Which households does this number belong to?" */
  async findByPhone(phone: string): Promise<CustomerRecord[]> {
    const rows = await this.db.query<Row>(
      "SELECT customer_id FROM customer_contacts WHERE phone = $1",
      [phone],
    );
    const found = await Promise.all(rows.map((r) => this.get(String(r.customer_id))));
    return found.filter((c): c is CustomerRecord => c !== null);
  }

  /** Next free customer reference: CUS-0001, CUS-0002, ... */
  async nextCode(): Promise<string> {
    const rows = await this.db.query<{ next: number | string }>(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)), 0) + 1 AS next
         FROM customers
        WHERE code ~ '^CUS-[0-9]+$'`,
    );
    const next = Number(rows[0]?.next ?? 1);
    return `CUS-${String(next).padStart(4, "0")}`;
  }

  // ------------------------------------------------------------------ writes

  async insert(customer: Customer, db: Database = this.db): Promise<void> {
    await db.query(
      `INSERT INTO customers (id, code, name, kind, notes, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        customer.id,
        customer.code,
        customer.name,
        customer.kind,
        customer.notes,
        customer.active,
        customer.createdAt,
        customer.updatedAt,
      ],
    );
  }

  async insertLocation(
    location: CustomerLocation,
    db: Database = this.db,
  ): Promise<void> {
    await db.query(
      `INSERT INTO customer_locations
         (id, customer_id, label, address_line, details, area, town,
          pin_lat, pin_lng, is_primary, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        location.id,
        location.customerId,
        location.label,
        location.addressLine,
        location.details,
        location.area,
        location.town,
        location.pinLat,
        location.pinLng,
        location.isPrimary,
        location.active,
        location.createdAt,
      ],
    );
  }

  async insertContact(
    contact: CustomerContact,
    db: Database = this.db,
  ): Promise<void> {
    await db.query(
      `INSERT INTO customer_contacts
         (id, customer_id, phone, name, role, is_primary, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        contact.id,
        contact.customerId,
        contact.phone,
        contact.name,
        contact.role,
        contact.isPrimary,
        contact.notes,
        contact.createdAt,
      ],
    );
  }

  async updateCustomer(
    id: string,
    patch: CustomerPatch,
    db: Database = this.db,
  ): Promise<void> {
    const sets: string[] = ["updated_at = $2"];
    const params: unknown[] = [id, new Date().toISOString()];
    for (const [column, key] of [
      ["name", "name"],
      ["kind", "kind"],
      ["notes", "notes"],
      ["active", "active"],
    ] as const) {
      const value = patch[key];
      if (value !== undefined) {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
    }
    await db.query(
      `UPDATE customers SET ${sets.join(", ")} WHERE id = $1`,
      params,
    );
  }

  async delete(id: string, db: Database = this.db): Promise<void> {
    await db.query("DELETE FROM customers WHERE id = $1", [id]);
  }

  async updateLocation(
    id: string,
    patch: Partial<CustomerLocation>,
    db: Database = this.db,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [column, key] of [
      ["label", "label"],
      ["address_line", "addressLine"],
      ["details", "details"],
      ["area", "area"],
      ["town", "town"],
      ["pin_lat", "pinLat"],
      ["pin_lng", "pinLng"],
      ["is_primary", "isPrimary"],
      ["active", "active"],
    ] as const) {
      const value = patch[key];
      if (value !== undefined) {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
    }
    if (sets.length === 0) return;
    await db.query(
      `UPDATE customer_locations SET ${sets.join(", ")} WHERE id = $1`,
      params,
    );
  }

  async updateContact(
    id: string,
    patch: Partial<CustomerContact>,
    db: Database = this.db,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [column, key] of [
      ["phone", "phone"],
      ["name", "name"],
      ["role", "role"],
      ["is_primary", "isPrimary"],
      ["notes", "notes"],
    ] as const) {
      const value = patch[key];
      if (value !== undefined) {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
    }
    if (sets.length === 0) return;
    await db.query(
      `UPDATE customer_contacts SET ${sets.join(", ")} WHERE id = $1`,
      params,
    );
  }

  async deleteLocation(id: string, db: Database = this.db): Promise<void> {
    await db.query("DELETE FROM customer_locations WHERE id = $1", [id]);
  }

  async deleteContact(id: string, db: Database = this.db): Promise<void> {
    await db.query("DELETE FROM customer_contacts WHERE id = $1", [id]);
  }

  /** Clears the primary flag so another row can take it. */
  async clearPrimaryLocation(
    customerId: string,
    db: Database = this.db,
  ): Promise<void> {
    await db.query(
      "UPDATE customer_locations SET is_primary = false WHERE customer_id = $1",
      [customerId],
    );
  }

  async clearPrimaryContact(
    customerId: string,
    db: Database = this.db,
  ): Promise<void> {
    await db.query(
      "UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1",
      [customerId],
    );
  }

  /** Runs a unit of work so a partially-written customer cannot survive. */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }
}
