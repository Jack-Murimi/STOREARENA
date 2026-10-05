import { CustomerService, seedCustomers } from "@/lib/customers";
import { CUSTOMER_SCHEMA } from "@/lib/customers/schemaText";
import { connectPostgres, postgresDatabase } from "@/lib/customers/postgres";

/**
 * Where customer data comes from.
 *
 * - `database`    — Supabase over TLS, using DATABASE_URL. This is production.
 * - `demo`        — a throwaway in-process PostgreSQL (PGlite) with demo rows.
 *                   Development only, because PGlite is a devDependency and a
 *                   serverless function has no writable filesystem to boot it
 *                   on.
 * - `unavailable` — no usable database. The screens explain what to set instead
 *                   of throwing, because a fallback that crashes the page is
 *                   worse than no fallback at all.
 */
export type DataSourceMode = "database" | "demo" | "unavailable";

export interface CustomerContext {
  /** Null when there is no usable database — check before using. */
  service: CustomerService | null;
  mode: DataSourceMode;
  notice: string | null;
}

const CONNECT_TIMEOUT_MS = 8_000;

declare global {
  // Survives Next.js hot reloads in development.
  var __gatewayCustomerContext: Promise<CustomerContext> | undefined;
}

function unavailable(reason: string): CustomerContext {
  return {
    service: null,
    mode: "unavailable",
    notice: `${reason} Set DATABASE_URL to your Supabase connection string — in .env.local here, or under Site settings → Environment variables on Netlify — then redeploy.`,
  };
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
      `[customers] DATABASE_URL unreachable (${(error as Error).message})`,
    );
    return null;
  }
}

/** Development convenience only. Never runs in a production deployment. */
async function demoContext(): Promise<CustomerContext | null> {
  try {
    const { PGlite } = await import("@electric-sql/pglite");
    const { pgliteDatabase } = await import("@/lib/customers/pglite");

    const db = new PGlite();
    await db.exec(CUSTOMER_SCHEMA);

    const service = new CustomerService(pgliteDatabase(db));
    await seedCustomers(service);

    return {
      service,
      mode: "demo",
      notice:
        "Showing demo customers in a temporary in-memory database. Changes are real but vanish on restart — set DATABASE_URL to use Supabase.",
    };
  } catch (error) {
    console.warn(`[customers] demo store unavailable: ${(error as Error).message}`);
    return null;
  }
}

function demoAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_STORE === "1"
  );
}

async function build(): Promise<CustomerContext> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const connected = await tryDatabase(url);
    if (connected) return connected;
    if (!demoAllowed()) {
      return unavailable("The configured database could not be reached.");
    }
    const demo = await demoContext();
    if (demo) return demo;
    return unavailable("The configured database could not be reached.");
  }

  if (!demoAllowed()) {
    return unavailable("No database is configured.");
  }

  const demo = await demoContext();
  return demo ?? unavailable("No database is configured.");
}

/** The customer service for this request, and where it is pointed. */
export function getCustomerContext(): Promise<CustomerContext> {
  globalThis.__gatewayCustomerContext ??= build();
  return globalThis.__gatewayCustomerContext;
}
