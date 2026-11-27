/**
 * Server-only SQL helper.
 * - With DATABASE_URL (published Cursor app Postgres): uses `pg`.
 * - Without: callers should use the filesystem fallback in `runs.ts`.
 *
 * Fail fast on connect (timeouts + SSL) so /api/run returns JSON instead of
 * hanging until the browser shows "Failed to fetch".
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const unpooledUrl =
  process.env.DATABASE_URL_UNPOOLED?.trim() || databaseUrl;

let pool: pg.Pool | undefined;
let ready: Promise<void> | undefined;

export function hasDatabase(): boolean {
  return databaseUrl !== "";
}

function sslOption(connectionString: string): { ssl?: pg.ConnectionConfig["ssl"] } {
  const local =
    /localhost|127\.0\.0\.1/i.test(connectionString) ||
    connectionString.includes("sslmode=disable");
  return local ? {} : { ssl: { rejectUnauthorized: false } };
}

function poolConfig(connectionString: string): pg.PoolConfig {
  return {
    connectionString,
    max: 1,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ...sslOption(connectionString),
  };
}

function clientConfig(connectionString: string): pg.ClientConfig {
  return {
    connectionString,
    connectionTimeoutMillis: 8_000,
    ...sslOption(connectionString),
  };
}

async function getPool(): Promise<pg.Pool> {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pool) {
    const mod = await import("pg");
    const PgPool = mod.default?.Pool ?? mod.Pool;
    pool = new PgPool(poolConfig(databaseUrl));
    pool.on("error", () => {
      // Idle client errors should not crash the isolate.
    });
  }
  return pool;
}

/** Apply SQL migrations once per isolate (build may have already applied them). */
async function ensureReady(): Promise<void> {
  if (!hasDatabase()) return;
  if (!ready) {
    ready = (async () => {
      const mod = await import("pg");
      const Client = mod.default?.Client ?? mod.Client;
      const client = new Client(clientConfig(unpooledUrl));
      try {
        await client.connect();
        await client.query("set lock_timeout = '15s'");
        await client.query(
          "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())"
        );
        const dir = path.join(process.cwd(), "migrations");
        const files = (await readdir(dir).catch(() => [] as string[]))
          .filter((f) => f.endsWith(".sql"))
          .sort();
        const done = new Set(
          (
            await client.query<{ name: string }>(
              "select name from schema_migrations"
            )
          ).rows.map((r) => r.name)
        );
        for (const file of files.filter((f) => !done.has(f))) {
          await client.query("begin");
          try {
            await client.query(await readFile(path.join(dir, file), "utf8"));
            await client.query(
              "insert into schema_migrations (name) values ($1)",
              [file]
            );
            await client.query("commit");
          } catch (error) {
            await client.query("rollback");
            throw error;
          }
        }
        // Safety net if migrations dir was missing from the bundle.
        await client.query(`
          create table if not exists runs (
            run_id text primary key,
            payload jsonb not null,
            status text not null,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          )
        `);
        await client.query(
          "create index if not exists runs_created_at_idx on runs (created_at desc)"
        );
      } finally {
        await client.end().catch(() => undefined);
      }
    })().catch((error: unknown) => {
      ready = undefined;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`数据库初始化失败：${message}`);
    });
  }
  await ready;
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureReady();
  const p = await getPool();
  try {
    return (await p.query(text, params)).rows as T[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`数据库查询失败：${message}`);
  }
}
