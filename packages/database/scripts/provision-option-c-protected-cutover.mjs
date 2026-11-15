import "dotenv/config";
import pg from "pg";

import {
  migrationClientConfig,
  verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";
import { readOptionCCutoverConfiguration } from "./option-c-protected-cutover-state.mjs";
import { runOptionCProtectedCutoverTransaction } from "./option-c-protected-cutover-transaction.mjs";

const { Client } = pg;

async function executeFormatted(client, format, values) {
  const placeholders = values.map((_, index) => `$${index + 2}::text`).join(", ");
  const result = await client.query(
    `SELECT pg_catalog.format($1, ${placeholders}) AS statement`,
    [format, ...values],
  );
  const statement = result.rows[0]?.statement;
  if (typeof statement !== "string") {
    throw new Error("Option C protected cutover could not construct safe SQL.");
  }
  await client.query(statement);
}

async function provisionOptionCProtectedCutover() {
  // URL parsing is local input validation. Authoritative catalog/ACL checks
  // happen only after the private boundary row is locked in the transaction.
  const configuration = readOptionCCutoverConfiguration(process.env);
  const client = new Client(
    migrationClientConfig(configuration.migration, process.env.NODE_ENV),
  );
  try {
    await client.connect();
    await verifyMigrationConnectionTls(client, process.env.NODE_ENV);
    const result = await runOptionCProtectedCutoverTransaction(
      client,
      {
        migrationRole: configuration.migrationIdentity.role,
        runtimeRole: configuration.runtimeIdentity.role,
      },
      executeFormatted,
    );
    console.log(result.promoted
      ? "Option C protected writer boundary promoted atomically."
      : "Option C protected writer boundary verified; already PROTECTED.");
  } finally {
    await client.end();
  }
}

await provisionOptionCProtectedCutover();
