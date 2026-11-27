/**
 * Server-only SQL helper.
 * - With DATABASE_URL (published Cursor app Postgres): uses `pg`.
 * - Without: callers should use the filesystem fallback in `runs.ts`.
 */
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

let pool: pg.Pool | undefined;

export function hasDatabase(): boolean {
  return databaseUrl !== "";
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL is not set");
  }
  pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
  return (await pool.query(text, params)).rows as T[];
}
