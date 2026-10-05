import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CustomerService, seedCustomers } from "@/lib/customers";
import type { Database } from "@/lib/customers";
import { connectPostgres, postgresDatabase } from "@/lib/customers/postgres";

/**
 * Where customer data comes from.
 *
 * In production this is Supabase over TLS, using `DATABASE_URL`. When that is
 * missing or unreachable — a laptop with no VPN, this sandbox, a CI box — the
 * app falls back to a throwaway in-process PostgreSQL (PGlite) seeded with demo
 * customers, and says so on screen. Nothing is ever silently written to the
 * wrong place: the mode is reported to the UI every time.
 */
export type DataSourceMode = "database" | "demo";

export interface CustomerContext {
  service: CustomerService;
  mode: DataSourceMode;
  notice: string | null;
}

const CONNECT_TIMEOUT_MS = 6_000;

declare global {
  // Survives Next.js hot reloads in development.
  var __gatewayCustomerContext: Promise<CustomerContext> | undefined;
}

async function tryDatabase(url: string): Promise<CustomerContext | null> {
  const sql = connectPostgres(url);
  try {
    await Promise.race([
      sql`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`timed out after ${CONNECT_TIMEOUT_MS}ms`)),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ]);
    return {
      service: new CustomerService(postgresDatabase(sql)),
      mode: "database",
      notice: null,
    };
  } catch (error) {
    await sql.end({ timeout: 2 }).catch(() => {});
    console.warn(
      `[customers] DATABASE_URL unreachable (${(error as Error).message}); using the demo store.`,
    );
    return null;
  }
}

async function demoContext(reason: string): Promise<CustomerContext> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pgliteDatabase } = await import("@/lib/customers/pglite");

  const db = new PGlite();
  const ddl = readFileSync(
    join(process.cwd(), "src/lib/customers/schema.sql"),
    "utf8",
  );
  await db.exec(ddl);

  const service = new CustomerService(pgliteDatabase(db) satisfies Database);
  await seedCustomers(service);

  return {
    service,
    mode: "demo",
    notice: `Showing demo customers in a temporary in-memory database (${reason}). Changes are real but will be lost when the server restarts — set DATABASE_URL to write to Supabase.`,
  };
}

async function build(): Promise<CustomerContext> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return demoContext("no DATABASE_URL configured");
  }
  const connected = await tryDatabase(url);
  if (connected) return connected;
  return demoContext("could not reach the configured database");
}

/** The customer service for this request, and where it is pointed. */
export function getCustomerContext(): Promise<CustomerContext> {
  globalThis.__gatewayCustomerContext ??= build();
  return globalThis.__gatewayCustomerContext;
}
