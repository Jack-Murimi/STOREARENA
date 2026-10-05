import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CustomerError,
  CustomerErrorCode,
  CustomerKind,
  CustomerService,
  DuplicateLabelError,
  DuplicatePhoneError,
  InvalidNameError,
  InvalidPhoneError,
  InvalidPinError,
  NoContactsError,
  NoLocationsError,
  UnknownContactError,
  UnknownCustomerError,
  formatKenyanPhone,
  normalizeKenyanPhone,
  seedCustomers,
} from "../index";
import { createDatabase, serviceFor, truncate } from "./helpers";

/**
 * One PostgreSQL engine (PGlite — the real server in WebAssembly) shared by the
 * service tests and the schema tests, so the very SQL that ships is executed
 * here and the suite stays quick.
 */
let db: PGlite;
let service: CustomerService;

beforeAll(async () => {
  db = await createDatabase();
  service = serviceFor(db);
}, 120_000);

beforeEach(async () => {
  await truncate(db);
});

afterAll(async () => {
  await db?.close();
});

async function expectFailure(sql: string): Promise<string> {
  try {
    await db.exec(sql);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected the statement to fail, but it succeeded");
}

/** A household with two places and three people, the way the book looks. */
function kathomi() {
  return service.create({
    name: "Kathomi Household",
    kind: CustomerKind.Household,
    locations: [
      { label: "Main house", area: "Syokimau", town: "Machakos", isPrimary: true },
      { label: "Annex", area: "Syokimau" },
    ],
    contacts: [
      { phone: "0712 345 678", name: "Jane Kathomi", role: "Wife", isPrimary: true },
      { phone: "0722111222", name: "Peter Kathomi", role: "Husband" },
      { phone: "0733 900 100", name: "Grace W.", role: "Maid" },
    ],
  });
}

describe("creating a customer", () => {
  it("stores one customer with several places, several numbers and a code", async () => {
    const created = await kathomi();

    expect(created.code).toBe("CUS-0001");
    expect(created.kind).toBe(CustomerKind.Household);
    expect(created.locations.map((l) => l.label)).toEqual(["Main house", "Annex"]);
    expect(created.contacts).toHaveLength(3);
    expect(created.active).toBe(true);

    const second = await service.create({
      name: "Mwangangi Family",
      locations: [{ label: "Home", area: "Mlolongo" }],
      contacts: [{ phone: "0720456789", name: "Samuel Mwangangi", role: "Father" }],
    });
    expect(second.code).toBe("CUS-0002");
  });

  it("keeps the role optional and normalises every number", async () => {
    const created = await service.create({
      name: "Otieno Household",
      locations: [{ label: "Home" }],
      contacts: [
        { phone: "0712 345 678", name: "A One", role: "Father" },
        { phone: "+254 722 111 222", name: "A Two" },
        { phone: "254733900100", name: "A Three", role: "" },
        { phone: "0741-222-333", name: "A Four" },
      ],
    });

    expect(created.contacts.map((c) => c.phone).sort()).toEqual([
      "+254712345678",
      "+254722111222",
      "+254733900100",
      "+254741222333",
    ]);
    expect(created.contacts.map((c) => c.role).sort()).toEqual([
      "Father",
      null,
      null,
      null,
    ]);
    expect(formatKenyanPhone("+254712345678")).toBe("0712 345 678");
  });

  it("elects exactly one primary place and one primary number", async () => {
    const created = await service.create({
      name: "Otieno Household",
      locations: [{ label: "Home" }, { label: "Shop" }],
      contacts: [
        { phone: "0712345678", name: "A One" },
        { phone: "0722111222", name: "A Two" },
      ],
    });

    expect(created.locations.filter((l) => l.isPrimary)).toHaveLength(1);
    expect(created.contacts.filter((c) => c.isPrimary)).toHaveLength(1);
  });

  it.each([
    ["no delivery place", NoLocationsError, {
      name: "Nowhere Family", locations: [], contacts: [{ phone: "0712345678", name: "A One" }] }],
    ["no phone number", NoContactsError, {
      name: "Silent Family", locations: [{ label: "Home" }], contacts: [] }],
    ["a landline", InvalidPhoneError, {
      name: "Bad Number Family", locations: [{ label: "Home" }],
      contacts: [{ phone: "020 272 0000", name: "A One" }] }],
    ["the same label twice", DuplicateLabelError, {
      name: "Confused Family", locations: [{ label: "Main house" }, { label: "main house" }],
      contacts: [{ phone: "0712345678", name: "A One" }] }],
    ["the same number twice", DuplicatePhoneError, {
      name: "Confused Family", locations: [{ label: "Home" }],
      contacts: [{ phone: "0712345678", name: "A One" },
                 { phone: "+254712345678", name: "A One Again" }] }],
    ["a one-letter name", InvalidNameError, {
      name: "X", locations: [{ label: "Home" }], contacts: [{ phone: "0712345678", name: "A One" }] }],
  ])("refuses %s", async (_label, expected, input) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(service.create(input as any)).rejects.toThrow(expected);
    expect(await service.list()).toEqual([]); // nothing half-written
  });
});

describe("reading customers", () => {
  it("finds a customer by name, code, contact name or phone number", async () => {
    await kathomi();
    await service.create({
      name: "Kirimi Hotels Ltd",
      kind: CustomerKind.Business,
      locations: [{ label: "Kitchen", area: "Kitengela" }],
      contacts: [{ phone: "0700111222", name: "Alice Kirimi", role: "Manager" }],
    });

    expect((await service.list()).map((c) => c.code)).toEqual(["CUS-0001", "CUS-0002"]);
    for (const [search, expected] of [
      ["kirimi", "Kirimi Hotels Ltd"],
      ["CUS-0001", "Kathomi Household"],
      ["grace", "Kathomi Household"],
      ["0722111222", "Kathomi Household"],
    ] as const) {
      expect((await service.list({ search })).map((c) => c.name)).toEqual([expected]);
    }
  });

  it("finds every household a shared number belongs to", async () => {
    await kathomi();
    await service.create({
      name: "Neighbouring Family",
      locations: [{ label: "Home", area: "Syokimau" }],
      contacts: [{ phone: "0733900100", name: "Grace W.", role: "Maid" }],
    });

    expect((await service.findByPhone("0733 900 100")).map((c) => c.name).sort()).toEqual([
      "Kathomi Household",
      "Neighbouring Family",
    ]);
  });

  it("hides inactive customers unless asked, and refuses an unknown id", async () => {
    const created = await kathomi();
    await service.update(created.id, { active: false });

    expect(await service.list()).toEqual([]);
    expect(await service.list({ includeInactive: true })).toHaveLength(1);
    await expect(service.get("cus-ghost")).rejects.toThrow(UnknownCustomerError);
  });
});

describe("updating a customer", () => {
  it("renames, re-kinds and re-notes, but not to a blank name", async () => {
    const created = await kathomi();

    const updated = await service.update(created.id, {
      name: "Kathomi Family",
      kind: CustomerKind.Business,
      notes: "Prefers morning deliveries.",
    });
    expect(updated).toMatchObject({
      name: "Kathomi Family",
      kind: CustomerKind.Business,
      notes: "Prefers morning deliveries.",
    });

    await expect(service.update(created.id, { name: "  " })).rejects.toThrow(
      InvalidNameError,
    );
  });
});

describe("delivery places", () => {
  it("adds, renames, promotes and refuses a duplicate label", async () => {
    const created = await kathomi();

    const withShop = await service.addLocation(created.id, {
      label: "Shop",
      addressLine: "Syokimau Shopping Centre",
      area: "Syokimau",
    });
    expect(withShop.locations.map((l) => l.label)).toEqual(["Main house", "Annex", "Shop"]);
    expect(withShop.locations.find((l) => l.isPrimary)?.label).toBe("Main house");

    const shop = withShop.locations.find((l) => l.label === "Shop")!;
    const promoted = await service.updateLocation(created.id, shop.id, {
      isPrimary: true,
      label: "Main shop",
    });
    expect(promoted.locations.filter((l) => l.isPrimary)).toHaveLength(1);
    expect(promoted.locations.find((l) => l.isPrimary)?.label).toBe("Main shop");

    await expect(
      service.addLocation(created.id, { label: "MAIN HOUSE" }),
    ).rejects.toThrow(DuplicateLabelError);
  });

  it("promotes another place when the main one goes, and keeps the last one", async () => {
    const created = await kathomi();
    const main = created.locations.find((l) => l.label === "Main house")!;

    const after = await service.removeLocation(created.id, main.id);
    expect(after.locations.map((l) => l.label)).toEqual(["Annex"]);
    expect(after.locations[0].isPrimary).toBe(true);

    await expect(
      service.removeLocation(created.id, after.locations[0].id),
    ).rejects.toThrow(NoLocationsError);
  });
});

describe("people to call", () => {
  it("adds a number with or without a role, and corrects one", async () => {
    const created = await kathomi();

    const added = await service.addContact(created.id, {
      phone: "0741 222 333",
      name: "Kevin Kathomi",
      role: "Children",
    });
    expect(added.contacts.find((c) => c.name === "Kevin Kathomi")).toMatchObject({
      phone: "+254741222333",
      role: "Children",
      isPrimary: false,
    });

    const anonymous = await service.addContact(created.id, {
      phone: "0755 000 111",
      name: "Someone Else",
    });
    expect(anonymous.contacts.find((c) => c.name === "Someone Else")?.role).toBeNull();

    const grace = anonymous.contacts.find((c) => c.name === "Grace W.")!;
    const corrected = await service.updateContact(created.id, grace.id, {
      phone: "0755 123 456",
      role: "Caretaker",
    });
    expect(corrected.contacts.find((c) => c.id === grace.id)).toMatchObject({
      phone: "+254755123456",
      role: "Caretaker",
    });
  });

  it("refuses a duplicate number, a landline and an unknown contact", async () => {
    const created = await kathomi();

    await expect(
      service.addContact(created.id, { phone: "0712345678", name: "Impostor" }),
    ).rejects.toThrow(DuplicatePhoneError);
    await expect(
      service.addContact(created.id, { phone: "020 272 0000", name: "Office" }),
    ).rejects.toThrow(InvalidPhoneError);
    await expect(service.removeContact(created.id, "con-nope")).rejects.toThrow(
      UnknownContactError,
    );
  });

  it("promotes another number when the main one goes, and keeps the last one", async () => {
    const created = await kathomi();
    const jane = created.contacts.find((c) => c.name === "Jane Kathomi")!;

    const after = await service.removeContact(created.id, jane.id);
    expect(after.contacts).toHaveLength(2);
    expect(after.contacts.filter((c) => c.isPrimary)).toHaveLength(1);

    for (const contact of after.contacts.slice(1)) {
      await service.removeContact(created.id, contact.id);
    }
    const last = (await service.get(created.id)).contacts[0];
    await expect(service.removeContact(created.id, last.id)).rejects.toThrow(
      NoContactsError,
    );
  });
});

describe("deleting a customer", () => {
  it("takes every place and number with it, and reports a stable code", async () => {
    const created = await kathomi();

    await service.remove(created.id);
    expect(await service.list({ includeInactive: true })).toEqual([]);
    const { rows } = await db.query<{ n: number }>(
      "SELECT (SELECT count(*) FROM customer_locations) + (SELECT count(*) FROM customer_contacts) AS n",
    );
    expect(Number(rows[0].n)).toBe(0);

    try {
      await service.get("cus-ghost");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as CustomerError).code).toBe(CustomerErrorCode.UnknownCustomer);
    }
  });
});

describe("seed data", () => {
  it("creates households and a business with several places and people", async () => {
    const created = await seedCustomers(service);

    expect(created.map((c) => c.code)).toEqual(["CUS-0001", "CUS-0002", "CUS-0003"]);
    expect(created[2].kind).toBe(CustomerKind.Business);
    expect(created[0].locations).toHaveLength(2);
    // Primary contact first, then by name: Jane, Grace, Peter.
    expect(created[0].contacts.map((c) => c.role)).toEqual(["Wife", "Maid", "Husband"]);
    for (const customer of created) {
      for (const contact of customer.contacts) {
        expect(normalizeKenyanPhone(contact.phone)).toBe(contact.phone);
      }
    }
  });
});

/**
 * The database's own rules, checked by running the real DDL. If the service
 * ever has a gap, these constraints are the net underneath it.
 */
describe("database constraints", () => {
  async function insertCustomer(id: string, phone = "+254712345678"): Promise<void> {
    await db.exec(`
      INSERT INTO customers (id, code, name) VALUES ('${id}', '${id.toUpperCase()}', 'Test Household');
      INSERT INTO customer_locations (id, customer_id, label, is_primary)
        VALUES ('${id}-loc', '${id}', 'Main house', true);
      INSERT INTO customer_contacts (id, customer_id, phone, name, is_primary)
        VALUES ('${id}-con', '${id}', '${phone}', 'Jane Doe', true);
    `);
  }

  it("creates the tables and the directory view, and no deposit column", async () => {
    const tables = await db.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "customer_contacts",
      "customer_locations",
      "customers",
    ]);

    const views = await db.query<{ viewname: string }>(
      "SELECT viewname FROM pg_views WHERE schemaname = 'public'",
    );
    expect(views.rows.map((v) => v.viewname)).toEqual(["v_customer_directory"]);

    const columns = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name LIKE 'customer%'`);
    expect(
      columns.rows.some((c) => /deposit|balance|credit/.test(c.column_name)),
    ).toBe(false);
  });

  it("refuses a landline, a duplicate number and a duplicate label", async () => {
    await insertCustomer("cus-1");

    expect(
      await expectFailure(`
        INSERT INTO customer_contacts (id, customer_id, phone, name)
        VALUES ('c1', 'cus-1', '0202720000', 'Landline')`),
    ).toMatch(/customer_contacts_phone_check/);

    expect(
      await expectFailure(`
        INSERT INTO customer_contacts (id, customer_id, phone, name)
        VALUES ('c2', 'cus-1', '+254712345678', 'Same number')`),
    ).toMatch(/customer_contact_phone_unique/);

    expect(
      await expectFailure(`
        INSERT INTO customer_locations (id, customer_id, label)
        VALUES ('l2', 'cus-1', 'Main house')`),
    ).toMatch(/customer_location_label_unique/);
  });

  it("allows one caretaker's number at two households, but only one primary", async () => {
    await insertCustomer("cus-1");
    await insertCustomer("cus-2", "+254799888777");

    await db.exec(`
      INSERT INTO customer_contacts (id, customer_id, phone, name, role)
      VALUES ('c3', 'cus-2', '+254712345678', 'Shared Caretaker', 'Caretaker')`);
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*) AS n FROM customer_contacts WHERE phone = '+254712345678'",
    );
    expect(Number(rows[0].n)).toBe(2);

    expect(
      await expectFailure(`
        INSERT INTO customer_locations (id, customer_id, label, is_primary)
        VALUES ('l3', 'cus-1', 'Annex', true)`),
    ).toMatch(/uq_customer_primary_location/);
  });

  it("refuses to leave a customer unreachable, or with a silly name or note", async () => {
    await insertCustomer("cus-1");

    expect(
      await expectFailure("DELETE FROM customer_locations WHERE customer_id = 'cus-1'"),
    ).toMatch(/no delivery location/);
    expect(
      await expectFailure("DELETE FROM customer_contacts WHERE customer_id = 'cus-1'"),
    ).toMatch(/no phone number/);
    expect(
      await expectFailure(
        "INSERT INTO customers (id, code, name) VALUES ('x', 'X9', 'X')"),
    ).toMatch(/customers_name_check/);
    expect(
      await expectFailure(
        "INSERT INTO customers (id, code, name, notes) VALUES ('y', 'Y9', 'Test', 'ab')"),
    ).toMatch(/customers_notes_meaningful/);
  });

  it("accepts a contact with no role, and joins everything in the directory view", async () => {
    await insertCustomer("cus-1");
    await db.exec(`
      INSERT INTO customer_contacts (id, customer_id, phone, name)
      VALUES ('c4', 'cus-1', '+254722111222', 'Anonymous Caller');
      INSERT INTO customer_locations (id, customer_id, label, area)
      VALUES ('l4', 'cus-1', 'Annex', 'Syokimau');
      UPDATE customer_contacts SET role = 'Maid' WHERE id = 'cus-1-con';
    `);

    const { rows } = await db.query<{ contact_name: string; role: string | null }>(`
      SELECT contact_name, role FROM v_customer_directory
       WHERE customer_id = 'cus-1' ORDER BY contact_name, location_label`);
    // 2 places x 2 numbers: every combination a rider might need.
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.role)).toContain("Maid");
    expect(rows.some((r) => r.role === null)).toBe(true);
  });
});

describe("the embedded schema", () => {
  it("matches schema.sql, so a deployed server runs the same DDL", async () => {
    const { readFileSync } = await import("node:fs");
    const { CUSTOMER_SCHEMA } = await import("../schemaText");
    const onDisk = readFileSync(
      new URL("../schema.sql", import.meta.url),
      "utf8",
    );

    expect(CUSTOMER_SCHEMA).toBe(onDisk);
  });
});

describe("addresses and map pins", () => {
  it("keeps a free-text address and the details that get you in the gate", async () => {
    const created = await service.create({
      name: "Jamry Apartment",
      locations: [
        {
          label: "Main house",
          addressLine: "house no 46 on Kinyajui road off Naivasha road",
          details: "opposite Fryz Inn hotel",
          pinLat: -1.2841,
          pinLng: 36.7519,
        },
      ],
      contacts: [{ phone: "0712345678", name: "Jane Wanjiku", role: "Wife" }],
    });

    expect(created.locations[0]).toMatchObject({
      addressLine: "house no 46 on Kinyajui road off Naivasha road",
      details: "opposite Fryz Inn hotel",
      pinLat: -1.2841,
      pinLng: 36.7519,
    });
  });

  it("accepts coordinates that arrive as text, the way a form sends them", async () => {
    const created = await service.create({
      name: "Text Pin Household",
      locations: [{ label: "Home", pinLat: "-1.284100", pinLng: "36.751900" }],
      contacts: [{ phone: "0712345678", name: "A One" }],
    });

    expect(created.locations[0].pinLat).toBe(-1.2841);
    expect(created.locations[0].pinLng).toBe(36.7519);
  });

  it("treats blank coordinates as no pin at all", async () => {
    const created = await service.create({
      name: "No Pin Household",
      locations: [{ label: "Home", pinLat: "", pinLng: "  " }],
      contacts: [{ phone: "0712345678", name: "A One" }],
    });

    expect(created.locations[0].pinLat).toBeNull();
    expect(created.locations[0].pinLng).toBeNull();
  });

  it("refuses half a pin, and coordinates off the map", async () => {
    for (const pin of [
      { pinLat: -1.2841 },
      { pinLng: 36.7519 },
      { pinLat: 91, pinLng: 36.7519 },
      { pinLat: -1.2841, pinLng: 181 },
      { pinLat: "not a number", pinLng: "36.75" },
    ]) {
      await expect(
        service.create({
          name: "Bad Pin Household",
          locations: [{ label: "Home", ...pin }],
          contacts: [{ phone: "0712345678", name: "A One" }],
        }),
      ).rejects.toThrow(InvalidPinError);
    }
    expect(await service.list()).toEqual([]);
  });

  it("adds and corrects a pin afterwards", async () => {
    const created = await kathomi();
    const main = created.locations.find((l) => l.label === "Main house")!;
    expect(main.pinLat).toBeNull();

    const pinned = await service.updateLocation(created.id, main.id, {
      pinLat: "-1.2841",
      pinLng: "36.7519",
      details: "blue gate, second driveway",
    });
    const updated = pinned.locations.find((l) => l.id === main.id)!;
    expect(updated).toMatchObject({
      pinLat: -1.2841,
      pinLng: 36.7519,
      details: "blue gate, second driveway",
    });

    const cleared = await service.updateLocation(created.id, main.id, {
      pinLat: null,
      pinLng: null,
    });
    expect(cleared.locations.find((l) => l.id === main.id)?.pinLat).toBeNull();
  });
});
