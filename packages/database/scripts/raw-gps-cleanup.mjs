import "dotenv/config";

import { fileURLToPath } from "node:url";

import pg from "pg";

import { parseRuntimeDatabaseUrlForProvisioning } from "./database-connection-policy.mjs";

const { Client } = pg;
const batchLimit = 1000;
const maximumBatches = 20;

export async function cleanupRawGps(environment = process.env) {
  const runtime = parseRuntimeDatabaseUrlForProvisioning(environment.DATABASE_URL);
  const client = new Client({
    connectionString: runtime.value,
    ...(environment.NODE_ENV === "production"
      ? {
          ssl: {
            ...(environment.DATABASE_TLS_CA_PEM === undefined
              ? {}
              : { ca: environment.DATABASE_TLS_CA_PEM }),
            rejectUnauthorized: true,
          },
        }
      : {}),
  });
  let deletedRows = 0;
  let batches = 0;
  try {
    await client.connect();
    while (batches < maximumBatches) {
      const result = await client.query(
        `SELECT public.cleanup_expired_raw_gps_samples($1)::integer
           AS deleted_count`,
        [batchLimit],
      );
      const deleted = result.rows[0]?.deleted_count;
      if (!Number.isInteger(deleted) || deleted < 0 || deleted > batchLimit) {
        throw new Error("Raw GPS cleanup returned an invalid aggregate.");
      }
      batches += 1;
      deletedRows += deleted;
      if (deleted < batchLimit) break;
    }
    return { batches, deletedRows };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  try {
    const result = await cleanupRawGps();
    console.log(JSON.stringify(result));
  } catch {
    console.error("Raw GPS cleanup failed.");
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
