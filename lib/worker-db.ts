import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function getConnectionString(): string | undefined {
  try {
    const runtimeEnv = getCloudflareContext({ async: false }).env as typeof globalThis & {
      HYPERDRIVE?: { connectionString?: string };
    };
    if (runtimeEnv.HYPERDRIVE?.connectionString) return runtimeEnv.HYPERDRIVE.connectionString;
  } catch {
    // Fall back to local environment variables outside the Worker.
  }
  return process.env.DIRECT_URL || process.env.DATABASE_URL;
}

function getPool() {
  if (pool) return pool;

  const runtimeConnectionString = getConnectionString();
  if (!runtimeConnectionString) throw new Error("Database connection string is unavailable.");

  const parsedConnectionString = new URL(runtimeConnectionString);
  parsedConnectionString.search = "";
  const connectionString = parsedConnectionString.toString();
  pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    ...(parsedConnectionString.password ? {} : { password: "" }),
  });
  return pool;
}

export function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!/timeout|connection terminated|connection reset|ECONNRESET/i.test(message)) throw error;

    pool = undefined;
    return getPool().query<T>(text, values);
  });
}
