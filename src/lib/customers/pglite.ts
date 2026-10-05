import type { PGlite } from "@electric-sql/pglite";
import type { Database, Row } from "./repository";

/** Anything that can run a parameterised query — a connection or a transaction. */
interface Queryable {
  query<T>(query: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Adapter for PGlite — real PostgreSQL compiled to WebAssembly.
 *
 * Used by the test suite so the very SQL that ships is executed against a real
 * server rather than a mock.
 */
export function pgliteDatabase(db: PGlite): Database {
  const make = (runner: Queryable): Database => ({
    async query<T = Row>(query: string, params: unknown[] = []): Promise<T[]> {
      const result = await runner.query<T>(query, params);
      return result.rows;
    },
    transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
      return db.transaction((tx) => fn(make(tx)));
    },
  });
  return make(db);
}
