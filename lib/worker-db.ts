import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

let localPool: Pool | undefined;
const requestPools = new WeakMap<object, Pool>();

function getRuntimeDatabaseContext(): { connectionString?: string; requestContext?: object } {
  try {
    const runtimeContext = getCloudflareContext({ async: false });
    const runtimeEnv = runtimeContext.env as typeof globalThis & {
      HYPERDRIVE?: { connectionString?: string };
    };
    if (runtimeEnv.HYPERDRIVE?.connectionString) {
      return {
        connectionString: runtimeEnv.HYPERDRIVE.connectionString,
        requestContext: runtimeContext.ctx as object,
      };
    }
  } catch {
    // Fall back to local environment variables outside the Worker.
  }
  return { connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL };
}

function createPool(runtimeConnectionString: string) {
  const parsedConnectionString = new URL(runtimeConnectionString);
  parsedConnectionString.search = "";
  const connectionString = parsedConnectionString.toString();
  return new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    ...(parsedConnectionString.password ? {} : { password: "" }),
  });
}

function getPool() {
  const { connectionString, requestContext } = getRuntimeDatabaseContext();
  if (!connectionString) throw new Error("Database connection string is unavailable.");

  if (requestContext) {
    const existingPool = requestPools.get(requestContext);
    if (existingPool) return existingPool;
    const requestPool = createPool(connectionString);
    requestPools.set(requestContext, requestPool);
    return requestPool;
  }

  localPool ||= createPool(connectionString);
  return localPool;
}

function discardPool(failedPool: Pool) {
  const { requestContext } = getRuntimeDatabaseContext();
  if (requestContext && requestPools.get(requestContext) === failedPool) {
    requestPools.delete(requestContext);
  } else if (localPool === failedPool) {
    localPool = undefined;
  }
  void failedPool.end().catch(() => undefined);
}

export function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  const activePool = getPool();
  return activePool.query<T>(text, values).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!/timeout|connection terminated|connection reset|ECONNRESET/i.test(message)) throw error;

    discardPool(activePool);
    return getPool().query<T>(text, values);
  });
}

export function queryWithTimeout<T extends QueryResultRow>(text: string, values: unknown[] = [], timeoutMs = 1500) {
  return (getPool() as any).query({ text, values, query_timeout: timeoutMs }) as Promise<{ rows: T[] }>;
}

export async function withDatabaseClient<T>(callback: (client: PoolClient) => Promise<T>) {
  const activePool = getPool();
  const client = await activePool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
