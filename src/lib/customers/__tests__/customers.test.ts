import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CustomerErrorCode,
  CustomerError,
  CustomerKind,
  CustomerService,
  DuplicateLabelError,
  DuplicatePhoneError,
  InvalidNameError,
  InvalidNotesError,
  InvalidPhoneError,
  InvalidRoleError,
  NoContactsError,
  NoLocationsError,
  UnknownCustomerError,
  UnknownCustomerLocationError,
  UnknownContactError,
  formatKenyanPhone,
  normalizeKenyanPhone,
  seedCustomers,
} from "../index";
import { createDatabase, serviceFor, truncate } from "./helpers";

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
  it("stores one customer with several locations and several numbers", async () => {
    const created = await kathomi();

    expect(created.code).toBe("CUS-0001");
    expect(created.name).toBe("Kathomi Household");
    expect(created.kind).toBe(CustomerKind.Household);
    expect(created.locations.map((l) => l.label)).toEqual(["Main house", "Annex"]);
    expect(created.contacts).toHaveLength(3);
    expect(created.active).toBe(true);
  });

  it("numbers customers in sequence", async () => {
    const first = await kathomi();
    const second = await service.create({
      name: "Mwangangi Family",
      locations: [{ label: "Home", area: "Mlolongo" }],
      contacts: [{ phone: "0720456789", name: "Samuel Mwangangi", role: "Father" }],
    });

    expect(first.code).toBe("CUS-0001");
    expect(second.code).toBe("CUS-0002");
  });

  it("keeps a role optional, because a house has all sorts of people", async () => {
    const created = await service.create({
      name: "Mwangangi Family",
      locations: [{ label: "Home" }],
      contacts: [
        { phone: "0720456789", name: "Samuel Mwangangi", role: "Father" },
        { phone: "0715666777", name: "Kevin Mwangangi" },
        { phone: "0741222333", name: "Ruth Mwangangi", role: "" },
      ],
    });

    expect(created.contacts.map((c) => c.role)).toEqual([
      "Father",
      null,
      null,
    ]);
  });

  it("normalises every phone number to one canonical form", async () => {
    const created = await service.create({
      name: "Otieno Household",
      locations: [{ label: "Home" }],
      contacts: [
        { phone: "0712 345 678", name: "A One" },
        { phone: "+254 722 111 222", name: "A Two" },
        { phone: "254733900100", name: "A Three" },
        { phone: "0741-222-333", name: "A Four" },
      ],
    });

    // Contacts come back primary first, then by name — so compare as a set.
    expect(created.contacts.map((c) => c.phone).sort()).toEqual([
      "+254712345678",
      "+254722111222",
      "+254733900100",
      "+254741222333",
    ]);
    expect(formatKenyanPhone("+254712345678")).toBe("0712 345 678");
  });

  it("elects exactly one primary location and one primary contact", async () => {
    const created = await service.create({
      name: "Otieno Household",
      locations: [{ label: "Home" }, { label: "Shop" }],
      contacts: [
        { phone: "0712345678", name: "A One" },
        { phone: "0722111222", name: "A Two" },
      ],
    });

    // Nobody was marked, so the first of each takes it.
    expect(created.locations.filter((l) => l.isPrimary)).toHaveLength(1);
    expect(created.locations[0].isPrimary).toBe(true);
    expect(created.contacts.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(created.contacts[0].isPrimary).toBe(true);
  });

  it("refuses a customer with no delivery location", async () => {
    await expect(
      service.create({
        name: "Nowhere Family",
        locations: [],
        contacts: [{ phone: "0712345678", name: "A One" }],
      }),
    ).rejects.toThrow(NoLocationsError);
  });

  it("refuses a customer with no phone number", async () => {
    await expect(
      service.create({
        name: "Silent Family",
        locations: [{ label: "Home" }],
        contacts: [],
      }),
    ).rejects.toThrow(NoContactsError);
  });

  it("refuses a phone number that is not a Kenyan mobile", async () => {
    for (const phone of ["12345", "020 272 0000", "+1 415 555 0123", "07123"]) {
      await expect(
        service.create({
          name: "Bad Number Family",
          locations: [{ label: "Home" }],
          contacts: [{ phone, name: "A One" }],
        }),
      ).rejects.toThrow(InvalidPhoneError);
    }
  });

  it("refuses the same location label twice", async () => {
    await expect(
      service.create({
        name: "Confused Family",
        locations: [{ label: "Main house" }, { label: "main house" }],
        contacts: [{ phone: "0712345678", name: "A One" }],
      }),
    ).rejects.toThrow(DuplicateLabelError);
  });

  it("refuses the same number twice for one customer", async () => {
    await expect(
      service.create({
        name: "Confused Family",
        locations: [{ label: "Home" }],
        contacts: [
          { phone: "0712345678", name: "A One" },
          { phone: "+254712345678", name: "A One Again" },
        ],
      }),
    ).rejects.toThrow(DuplicatePhoneError);
  });

  it("refuses a name, contact name, role or note too short to mean anything", async () => {
    await expect(
      service.create({
        name: "X",
        locations: [{ label: "Home" }],
        contacts: [{ phone: "0712345678", name: "A One" }],
      }),
    ).rejects.toThrow(InvalidNameError);

    await expect(
      service.create({
        name: "Short Name Family",
        locations: [{ label: "Home" }],
        contacts: [{ phone: "0712345678", name: "X" }],
      }),
    ).rejects.toThrow(InvalidNameError);

    await expect(
      service.create({
        name: "Short Role Family",
        locations: [{ label: "Home" }],
        contacts: [{ phone: "0712345678", name: "A One", role: "x" }],
      }),
    ).rejects.toThrow(InvalidRoleError);

    await expect(
      service.create({
        name: "Short Notes Family",
        notes: "ab",
        locations: [{ label: "Home" }],
        contacts: [{ phone: "0712345678", name: "A One" }],
      }),
    ).rejects.toThrow(InvalidNotesError);
  });

  it("writes nothing at all when creation fails", async () => {
    await expect(
      service.create({
        name: "Half Written",
        locations: [{ label: "Home" }],
        contacts: [{ phone: "not-a-number", name: "A One" }],
      }),
    ).rejects.toThrow(CustomerError);

    expect(await service.list()).toEqual([]);
  });
});

describe("reading customers", () => {
  it("returns the whole record for one customer", async () => {
    const created = await kathomi();
    const fetched = await service.get(created.id);

    expect(fetched.name).toBe("Kathomi Household");
    expect(fetched.locations).toHaveLength(2);
    expect(fetched.contacts).toHaveLength(3);
  });

  it("refuses an unknown customer", async () => {
    await expect(service.get("cus-does-not-exist")).rejects.toThrow(
      UnknownCustomerError,
    );
  });

  it("finds customers by name, by code and by phone", async () => {
    await kathomi();
    await service.create({
      name: "Kirimi Hotels Ltd",
      kind: CustomerKind.Business,
      locations: [{ label: "Kitchen", area: "Kitengela" }],
      contacts: [{ phone: "0700111222", name: "Alice Kirimi", role: "Manager" }],
    });

    expect((await service.list()).map((c) => c.code)).toEqual([
      "CUS-0001",
      "CUS-0002",
    ]);
    expect((await service.list({ search: "kirimi" })).map((c) => c.name)).toEqual([
      "Kirimi Hotels Ltd",
    ]);
    expect((await service.list({ search: "CUS-0001" })).map((c) => c.name)).toEqual([
      "Kathomi Household",
    ]);
    // Search reaches into the contacts too.
    expect((await service.list({ search: "0722111222" })).map((c) => c.name)).toEqual([
      "Kathomi Household",
    ]);
  });

  it("finds every household a shared number belongs to", async () => {
    await kathomi();
    await service.create({
      name: "Neighbouring Family",
      locations: [{ label: "Home", area: "Syokimau" }],
      contacts: [{ phone: "0733900100", name: "Grace W.", role: "Maid" }],
    });

    const found = await service.findByPhone("0733 900 100");
    expect(found.map((c) => c.name).sort()).toEqual([
      "Kathomi Household",
      "Neighbouring Family",
    ]);
  });

  it("hides inactive customers unless asked for them", async () => {
    const created = await kathomi();
    await service.update(created.id, { active: false });

    expect(await service.list()).toEqual([]);
    expect(await service.list({ includeInactive: true })).toHaveLength(1);
  });
});

describe("updating a customer", () => {
  it("renames and re-notes a customer", async () => {
    const created = await kathomi();
    const updated = await service.update(created.id, {
      name: "Kathomi Family",
      notes: "Prefers morning deliveries.",
    });

    expect(updated.name).toBe("Kathomi Family");
    expect(updated.notes).toBe("Prefers morning deliveries.");
    expect(updated.contacts).toHaveLength(3);
  });

  it("changes a business from household", async () => {
    const created = await kathomi();
    const updated = await service.update(created.id, {
      kind: CustomerKind.Business,
    });
    expect(updated.kind).toBe(CustomerKind.Business);
  });

  it("refuses a blank new name", async () => {
    const created = await kathomi();
    await expect(service.update(created.id, { name: "  " })).rejects.toThrow(
      InvalidNameError,
    );
  });
});

describe("locations", () => {
  it("adds another delivery place", async () => {
    const created = await kathomi();
    const updated = await service.addLocation(created.id, {
      label: "Shop",
      addressLine: "Syokimau Shopping Centre",
      area: "Syokimau",
    });

    expect(updated.locations.map((l) => l.label)).toEqual([
      "Main house",
      "Annex",
      "Shop",
    ]);
    // The new one did not steal the primary flag.
    expect(updated.locations.find((l) => l.isPrimary)?.label).toBe("Main house");
  });

  it("moves the primary flag when asked", async () => {
    const created = await kathomi();
    const annex = created.locations.find((l) => l.label === "Annex")!;

    const updated = await service.updateLocation(created.id, annex.id, {
      isPrimary: true,
    });

    expect(updated.locations.filter((l) => l.isPrimary)).toHaveLength(1);
    expect(updated.locations.find((l) => l.isPrimary)?.label).toBe("Annex");
  });

  it("renames a location", async () => {
    const created = await kathomi();
    const annex = created.locations.find((l) => l.label === "Annex")!;

    const updated = await service.updateLocation(created.id, annex.id, {
      label: "Guest wing",
    });
    expect(updated.locations.map((l) => l.label)).toContain("Guest wing");
  });

  it("refuses a duplicate label on the same customer", async () => {
    const created = await kathomi();
    await expect(
      service.addLocation(created.id, { label: "MAIN HOUSE" }),
    ).rejects.toThrow(DuplicateLabelError);
  });

  it("promotes another location when the primary one is removed", async () => {
    const created = await kathomi();
    const main = created.locations.find((l) => l.label === "Main house")!;

    const updated = await service.removeLocation(created.id, main.id);

    expect(updated.locations.map((l) => l.label)).toEqual(["Annex"]);
    expect(updated.locations[0].isPrimary).toBe(true);
  });

  it("refuses to remove the last delivery location", async () => {
    const created = await service.create({
      name: "Single Place Family",
      locations: [{ label: "Home" }],
      contacts: [{ phone: "0712345678", name: "A One" }],
    });
    const only = created.locations[0];

    await expect(service.removeLocation(created.id, only.id)).rejects.toThrow(
      NoLocationsError,
    );
    expect((await service.get(created.id)).locations).toHaveLength(1);
  });

  it("refuses an unknown location", async () => {
    const created = await kathomi();
    await expect(
      service.updateLocation(created.id, "loc-nope", { label: "Anything" }),
    ).rejects.toThrow(UnknownCustomerLocationError);
  });
});

describe("contacts", () => {
  it("adds another person to call", async () => {
    const created = await kathomi();
    const updated = await service.addContact(created.id, {
      phone: "0741 222 333",
      name: "Kevin Kathomi",
      role: "Children",
    });

    expect(updated.contacts).toHaveLength(4);
    expect(updated.contacts.find((c) => c.name === "Kevin Kathomi")).toMatchObject({
      phone: "+254741222333",
      role: "Children",
      isPrimary: false,
    });
  });

  it("adds a number with no role at all", async () => {
    const created = await kathomi();
    const updated = await service.addContact(created.id, {
      phone: "0741 222 333",
      name: "Someone Else",
    });

    expect(updated.contacts.find((c) => c.name === "Someone Else")?.role).toBeNull();
  });

  it("corrects a number and a role", async () => {
    const created = await kathomi();
    const grace = created.contacts.find((c) => c.name === "Grace W.")!;

    const updated = await service.updateContact(created.id, grace.id, {
      phone: "0755 123 456",
      role: "Caretaker",
    });

    const found = updated.contacts.find((c) => c.id === grace.id)!;
    expect(found.phone).toBe("+254755123456");
    expect(found.role).toBe("Caretaker");
  });

  it("refuses to reuse a number already on the account", async () => {
    const created = await kathomi();
    await expect(
      service.addContact(created.id, { phone: "0712345678", name: "Impostor" }),
    ).rejects.toThrow(DuplicatePhoneError);
  });

  it("refuses a landline", async () => {
    const created = await kathomi();
    await expect(
      service.addContact(created.id, { phone: "020 272 0000", name: "Office" }),
    ).rejects.toThrow(InvalidPhoneError);
  });

  it("promotes another contact when the primary one is removed", async () => {
    const created = await kathomi();
    const jane = created.contacts.find((c) => c.name === "Jane Kathomi")!;

    const updated = await service.removeContact(created.id, jane.id);

    expect(updated.contacts).toHaveLength(2);
    expect(updated.contacts.filter((c) => c.isPrimary)).toHaveLength(1);
  });

  it("refuses to remove the last phone number", async () => {
    const created = await kathomi();
    for (const contact of created.contacts.slice(1)) {
      await service.removeContact(created.id, contact.id);
    }
    const last = (await service.get(created.id)).contacts[0];

    await expect(service.removeContact(created.id, last.id)).rejects.toThrow(
      NoContactsError,
    );
  });

  it("refuses an unknown contact", async () => {
    const created = await kathomi();
    await expect(
      service.removeContact(created.id, "con-nope"),
    ).rejects.toThrow(UnknownContactError);
  });
});

describe("deleting a customer", () => {
  it("removes the customer and everything attached", async () => {
    const created = await kathomi();

    await service.remove(created.id);

    expect(await service.list({ includeInactive: true })).toEqual([]);
    const { rows } = await db.query<{ n: number }>(
      "SELECT (SELECT count(*) FROM customer_locations) + (SELECT count(*) FROM customer_contacts) AS n",
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("refuses to delete a customer that is not there", async () => {
    await expect(service.remove("cus-ghost")).rejects.toThrow(UnknownCustomerError);
  });

  it("reports a stable error code the UI can branch on", async () => {
    try {
      await service.get("cus-ghost");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as CustomerError).code).toBe(
        CustomerErrorCode.UnknownCustomer,
      );
    }
  });
});

describe("seed data", () => {
  it("creates households and a business with several places and people", async () => {
    const created = await seedCustomers(service);

    expect(created).toHaveLength(3);
    expect(created.map((c) => c.code)).toEqual([
      "CUS-0001",
      "CUS-0002",
      "CUS-0003",
    ]);
    expect(created[2].kind).toBe(CustomerKind.Business);
    expect(created[0].locations).toHaveLength(2);
    // Primary contact first, then by name: Jane, Grace, Peter.
    expect(created[0].contacts.map((c) => c.role)).toEqual([
      "Wife",
      "Maid",
      "Husband",
    ]);
    // Every number came out canonical.
    for (const customer of created) {
      for (const contact of customer.contacts) {
        expect(normalizeKenyanPhone(contact.phone)).toBe(contact.phone);
      }
    }
  });
});
