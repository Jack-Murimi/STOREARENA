import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { CustomerService } from "../index";
import { pgliteDatabase } from "../pglite";

/**
 * The real schema, executed by the real PostgreSQL engine (PGlite). The tests
 * therefore prove the DDL and the service together — not a mock of either.
 */
export const DDL = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(DDL);
  return db;
}

export function serviceFor(db: PGlite): CustomerService {
  return new CustomerService(pgliteDatabase(db));
}

/** Empties the tables between tests without tearing the database down. */
export async function truncate(db: PGlite): Promise<void> {
  await db.exec(`
    DELETE FROM customer_contacts;
    DELETE FROM customer_locations;
    DELETE FROM customers;
  `);
}
