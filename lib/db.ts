import { PrismaClient as PrismaClientRuntime } from "@prisma/client/index";
import type { PrismaClient as PrismaClientType } from "@prisma/client/index";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
};

function getConnectionString(): string | undefined {
  const configuredConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (configuredConnectionString) return configuredConnectionString;

  try {
    const runtimeEnv = getCloudflareContext({ async: false }).env as typeof globalThis & {
      HYPERDRIVE?: { connectionString?: string };
    };
    return runtimeEnv.HYPERDRIVE?.connectionString;
  } catch {
    return undefined;
  }
}

let prismaClient: PrismaClientType | undefined;

function getDb(): PrismaClientType {
  if (prismaClient) return prismaClient;
  if (globalForPrisma.prisma) {
    prismaClient = globalForPrisma.prisma;
    return prismaClient;
  }

  const runtimeConnectionString = getConnectionString();
  if (!runtimeConnectionString) throw new Error("Database connection string is unavailable.");

  const parsedConnectionString = new URL(runtimeConnectionString);
  for (const parameter of ["sslcert", "sslkey", "sslrootcert"]) {
    parsedConnectionString.searchParams.delete(parameter);
  }

  const connectionString = parsedConnectionString.toString();
  const poolConfig: { connectionString: string; password?: string } = { connectionString };
  if (!parsedConnectionString.password) poolConfig.password = "";

  prismaClient = new PrismaClientRuntime({
    adapter: new PrismaPg(new Pool(poolConfig), { schema: "macula" }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  }) as unknown as PrismaClientType;

  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prismaClient;
  return prismaClient;
}

export const db = new Proxy({} as PrismaClientType, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});
