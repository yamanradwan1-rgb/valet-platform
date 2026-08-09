import { Pool, type PoolClient } from "pg";

export type PostgresPool = Pool;
export type PostgresTransaction = PoolClient;

export function createRuntimePostgresPool(
  databaseUrl = process.env.DATABASE_URL,
): PostgresPool {
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("Application runtime requires DATABASE_URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Application runtime requires a valid DATABASE_URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Application runtime requires a PostgreSQL DATABASE_URL.");
  }
  if (parsed.search !== "") {
    throw new Error(
      "Application runtime DATABASE_URL must not contain query parameters.",
    );
  }
  if (parsed.hash !== "") {
    throw new Error(
      "Application runtime DATABASE_URL must not contain a URL fragment.",
    );
  }
  if (parsed.username === "") {
    throw new Error("Application runtime DATABASE_URL requires a username.");
  }
  if (parsed.password === "") {
    throw new Error("Application runtime DATABASE_URL requires a password.");
  }
  if (parsed.pathname.length <= 1) {
    throw new Error(
      "Application runtime DATABASE_URL requires a database name.",
    );
  }

  return new Pool({ connectionString: databaseUrl });
}
