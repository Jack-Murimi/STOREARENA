import { BillingService } from "@/lib/billing";
import { CustomerService, seedCustomers } from "@/lib/customers";
import { BILLING_SCHEMA, CUSTOMER_SCHEMA } from "@/lib/customers/schemaText";
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
  /** Invoices, payments and balances. Null alongside `service`. */
  billing: BillingService | null;
  mode: DataSourceMode;
  notice: string | null;
  /** What the function could see of its own configuration. Never a secret. */
  diagnostic?: string;
}

const CONNECT_TIMEOUT_MS = 8_000;

declare global {
  // Survives Next.js hot reloads in development.
  var __gatewayCustomerContext: Promise<CustomerContext> | undefined;
}

/**
 * What the running function can see, without ever echoing the password.
 *
 * "Is the variable actually there?" is the first question when a host like
 * Netlify serves this page, and guessing wastes a deploy cycle.
 */
export function describeDatabaseConfig(): string {
  const raw = process.env.DATABASE_URL;

  if (!raw || raw.trim().length === 0) {
    // Names only, never values: enough to spot a misspelled key, a variable
    // scoped to the build instead of the function, or one saved blank.
    const similar = Object.keys(process.env)
      .filter((key) => key !== "DATABASE_URL" && /DATABASE|SUPABASE|POSTGRES|PG_|SQL/i.test(key))
      .sort();
    const also =
      similar.length > 0
        ? ` Other database-like variables it can see: ${similar.join(", ")}.`
        : " It can see no other database-like variable either.";

    return Object.prototype.hasOwnProperty.call(process.env, "DATABASE_URL")
      ? `DATABASE_URL: present but empty — it was saved without a value.${also}`
      : `DATABASE_URL: not present in this function's environment.${also}`;
  }
  try {
    const url = new URL(raw);
    return `DATABASE_URL: present (host ${url.hostname}, database ${
      url.pathname.replace(/^\//, "") || "postgres"
    }, user ${url.username}).`;
  } catch {
    return "DATABASE_URL: present, but it is not a valid connection string.";
  }
}

function unavailable(reason: string): CustomerContext {
  return {
    service: null,
    billing: null,
    mode: "unavailable",
    diagnostic: describeDatabaseConfig(),
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
    const db = postgresDatabase(sql);
    return {
      service: new CustomerService(db),
      billing: new BillingService(db),
      mode: "database",
      notice: null,
      diagnostic: describeDatabaseConfig(),
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
    await db.exec(BILLING_SCHEMA);

    const adapter = pgliteDatabase(db);
    const service = new CustomerService(adapter);
    await seedCustomers(service);

    return {
      service,
      billing: new BillingService(adapter),
      mode: "demo",
      notice:
        "Showing demo customers in a temporary in-memory database. Changes are real but vanish on restart — set DATABASE_URL to use Supabase.",
      diagnostic: describeDatabaseConfig(),
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
