import postgres from "postgres";
import type { Database, Row } from "./repository";

/** Anything that can run a parameterised query — a pool or a transaction. */
interface Queryable {
  unsafe(query: string, parameters?: unknown[]): Promise<readonly Record<string, unknown>[]>;
}

/**
 * Adapter for postgres.js — what the app uses in production against Supabase.
 *
 * `unsafe(query, params)` runs a parameterised statement; `begin` gives a
 * transaction that rolls back if the callback throws.
 */
export function postgresDatabase(sql: postgres.Sql): Database {
  const make = (runner: Queryable): Database => ({
    async query<T = Row>(query: string, params: unknown[] = []): Promise<T[]> {
      const rows = await runner.unsafe(query, params);
      return rows as T[];
    },
    transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
      return sql.begin((tx) => fn(make(tx))) as Promise<T>;
    },
  });
  return make(sql);
}

/** Creates the connection used by server components and actions. */
export function connectPostgres(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    // Supabase requires TLS; keep the pool small — this is a staff portal.
    ssl: "require",
    max: 5,
    prepare: false,
    onnotice: () => {},
  });
}
