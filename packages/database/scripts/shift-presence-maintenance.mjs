import "dotenv/config";
import process from "node:process";
import console from "node:console";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";

/** Controlled privileged operator execution; no runtime credential or scheduler. */
export async function maintainShiftPresence(environment = process.env) {
  const migration = parseMigrationDatabaseUrl(
    environment.MIGRATION_DATABASE_URL,
    environment.NODE_ENV,
  );
  const client = new pg.Client(
    migrationClientConfig(migration, environment.NODE_ENV),
  );
  const counts = {
    batches: 0,
    expiredOperations: 0,
    expiredExceptions: 0,
    purgedChallenges: 0,
    purgedOperations: 0,
    purgedDecisions: 0,
    purgedExceptions: 0,
  };
  try {
    await client.connect();
    await verifyMigrationConnectionTls(client, environment.NODE_ENV);
    for (let batch = 0; batch < 20; batch += 1) {
      const result = await client.query(
        `SELECT public.shift_presence_maintain(1000) AS result`,
      );
      const values = result.rows[0]?.result;
      let changed = 0;
      for (const key of Object.keys(counts).filter(
        (key) => key !== "batches",
      )) {
        if (
          !Number.isInteger(values?.[key]) ||
          values[key] < 0 ||
          values[key] > 1000
        )
          throw new Error(
            "Presence maintenance returned an invalid aggregate.",
          );
        counts[key] += values[key];
        changed += values[key];
      }
      counts.batches += 1;
      if (changed === 0) break;
    }
    return counts;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  maintainShiftPresence()
    .then((counts) => console.log(JSON.stringify(counts)))
    .catch(() => {
      console.error("Shift Presence maintenance failed.");
      process.exitCode = 1;
    });
}
