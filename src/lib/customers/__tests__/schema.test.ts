import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "./helpers";

/**
 * The database's own rules, checked by running the real DDL in a real
 * PostgreSQL engine. If the service ever has a gap, these constraints are the
 * net underneath it.
 */
let db: PGlite;

async function expectFailure(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected the statement to fail, but it succeeded");
}

async function insertCustomer(
  id: string,
  name: string,
  code: string,
  kind = "HOUSEHOLD",
  phone = "+254712345678",
): Promise<void> {
  await db.query(
    `INSERT INTO customers (id, code, name, kind) VALUES ($1, $2, $3, $4)`,
    [id, code, name, kind],
  );
  await db.query(
    `INSERT INTO customer_locations (id, customer_id, label, is_primary)
     VALUES ($1, $2, 'Main house', true)`,
    [`${id}-loc`, id],
  );
  await db.query(
    `INSERT INTO customer_contacts (id, customer_id, phone, name, is_primary)
     VALUES ($1, $2, $3, 'Jane Doe', true)`,
    [`${id}-con`, id, phone],
  );
}

beforeAll(async () => {
  db = await createDatabase();
}, 120_000);

beforeEach(async () => {
  await db.exec(`
    DELETE FROM customer_contacts;
    DELETE FROM customer_locations;
    DELETE FROM customers;
  `);
});

afterAll(async () => {
  await db?.close();
});

describe("schema shape", () => {
  it("creates the customer tables and the directory view", async () => {
    const tables = await db.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name
    `);
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "customer_contacts",
      "customer_locations",
      "customers",
    ]);

    const views = await db.query<{ viewname: string }>(
      "SELECT viewname FROM pg_views WHERE schemaname = 'public'",
    );
    expect(views.rows.map((v) => v.viewname)).toEqual(["v_customer_directory"]);
  });

  it("keeps no deposit or balance column on a customer", async () => {
    const { rows } = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name LIKE 'customer%'
    `);
    const names = rows.map((r) => r.column_name);
    expect(names.some((n) => /deposit|balance|credit/.test(n))).toBe(false);
  });
});

describe("phone numbers", () => {
  it("refuses anything that is not a Kenyan mobile", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    const message = await expectFailure(`
      INSERT INTO customer_contacts (id, customer_id, phone, name)
      VALUES ('con-landline', 'cus-1', '0202720000', 'Landline Office')
    `);
    expect(message).toMatch(/customer_contacts_phone_check/);
  });

  it("allows the same number at two different customers", async () => {
    await insertCustomer("cus-1", "One Household", "CUS-0001");
    await insertCustomer("cus-2", "Two Household", "CUS-0002", "HOUSEHOLD", "+254799888777");

    // One caretaker, two households: perfectly normal.
    await db.query(`
      INSERT INTO customer_contacts (id, customer_id, phone, name, role)
      VALUES ('con-shared', 'cus-2', '+254712345678', 'Shared Caretaker', 'Caretaker')
    `);
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*) AS n FROM customer_contacts WHERE phone = '+254712345678'",
    );
    expect(Number(rows[0].n)).toBe(2);
  });

  it("refuses the same number twice on one customer", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    const message = await expectFailure(`
      INSERT INTO customer_contacts (id, customer_id, phone, name)
      VALUES ('con-dup', 'cus-1', '+254712345678', 'Same Number Again')
    `);
    expect(message).toMatch(/customer_contact_phone_unique/);
  });
});

describe("names and roles", () => {
  it("refuses a name too short to identify anybody", async () => {
    const message = await expectFailure(
      `INSERT INTO customers (id, code, name) VALUES ('cus-x', 'CUS-0099', 'X')`,
    );
    expect(message).toMatch(/customers_name_check/);
  });

  it("refuses a note too short to be worth reading", async () => {
    const message = await expectFailure(
      `INSERT INTO customers (id, code, name, notes) VALUES ('cus-x', 'CUS-0099', 'Test', 'ab')`,
    );
    expect(message).toMatch(/customers_notes_meaningful/);
  });

  it("accepts a contact with no role at all", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    await db.query(`
      INSERT INTO customer_contacts (id, customer_id, phone, name)
      VALUES ('con-norole', 'cus-1', '+254722111222', 'Anonymous Caller')
    `);
    const { rows } = await db.query<{ role: string | null }>(
      "SELECT role FROM customer_contacts WHERE id = 'con-norole'",
    );
    expect(rows[0].role).toBeNull();
  });

  it("refuses a role too short to mean anything", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    const message = await expectFailure(`
      INSERT INTO customer_contacts (id, customer_id, phone, name, role)
      VALUES ('con-badrole', 'cus-1', '+254722111222', 'Somebody', 'x')
    `);
    expect(message).toMatch(/customer_contacts_role_check/);
  });
});

describe("locations", () => {
  it("refuses two locations with the same label", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    const message = await expectFailure(`
      INSERT INTO customer_locations (id, customer_id, label)
      VALUES ('loc-dup', 'cus-1', 'Main house')
    `);
    expect(message).toMatch(/customer_location_label_unique/);
  });

  it("allows only one primary location per customer", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    const message = await expectFailure(`
      INSERT INTO customer_locations (id, customer_id, label, is_primary)
      VALUES ('loc-second-primary', 'cus-1', 'Annex', true)
    `);
    expect(message).toMatch(/uq_customer_primary_location/);
  });

  it("refuses to leave a customer with no delivery location", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    const message = await expectFailure(
      "DELETE FROM customer_locations WHERE customer_id = 'cus-1'",
    );
    expect(message).toMatch(/no delivery location/);
  });

  it("refuses to leave a customer with no phone number", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    const message = await expectFailure(
      "DELETE FROM customer_contacts WHERE customer_id = 'cus-1'",
    );
    expect(message).toMatch(/no phone number/);
  });
});

describe("deleting a customer", () => {
  it("takes every location and number with it", async () => {
    await insertCustomer("cus-1", "Test Household", "CUS-0001");

    await db.exec("DELETE FROM customers WHERE id = 'cus-1'");

    const { rows } = await db.query<{ n: number }>(`
      SELECT (SELECT count(*) FROM customer_locations)
           + (SELECT count(*) FROM customer_contacts) AS n
    `);
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe("the directory view", () => {
  it("joins customer, place and person in one row", async () => {
    await insertCustomer("cus-1", "Kathomi Household", "CUS-0001");
    await db.query(`
      INSERT INTO customer_contacts (id, customer_id, phone, name, role)
      VALUES ('con-maid', 'cus-1', '+254733900100', 'Grace W.', 'Maid')
    `);
    await db.query(`
      INSERT INTO customer_locations (id, customer_id, label, area)
      VALUES ('loc-annex', 'cus-1', 'Annex', 'Syokimau')
    `);

    const { rows } = await db.query<{
      customer_name: string;
      location_label: string;
      contact_name: string;
      role: string | null;
      primary_contact: boolean;
    }>(`
      SELECT customer_name, location_label, contact_name, role, primary_contact
        FROM v_customer_directory
       WHERE customer_id = 'cus-1'
       ORDER BY location_label, contact_name
    `);

    // 2 places x 2 contacts, every combination a rider might need.
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.role === "Maid")?.contact_name).toBe("Grace W.");
    expect(rows.filter((r) => r.primary_contact)).toHaveLength(2);
  });
});
