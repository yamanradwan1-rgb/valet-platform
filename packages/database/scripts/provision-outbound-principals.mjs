import "dotenv/config";
import pg from "pg";
import { migrationClientConfig, parseMigrationDatabaseUrl, verifyMigrationConnectionTls } from "./database-connection-policy.mjs";
import { provisionOutboundPrincipal } from "./outbound-principal-privileges.mjs";

function extractRole(source, label) {
  if (!source) throw new Error(`Missing ${label} database URL.`);
  let parsed;
  try { parsed = new URL(source); } catch { throw new Error(`Invalid ${label} database URL.`); }
  if (!["postgres:","postgresql:"].includes(parsed.protocol)
    || !parsed.username || !parsed.password || !parsed.pathname.startsWith("/")) {
    throw new Error(`Unsafe ${label} database URL.`);
  }
  return { role: decodeURIComponent(parsed.username), database: decodeURIComponent(parsed.pathname.slice(1)) };
}

async function main() {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  const sender = extractRole(process.env.OUTBOUND_MESSAGING_WORKER_DATABASE_URL, "sender");
  const webhook = extractRole(process.env.OUTBOUND_MESSAGING_WEBHOOK_DATABASE_URL, "webhook");
  const migration = extractRole(migrationUrl, "migration");
  const runtime = extractRole(process.env.DATABASE_URL, "runtime");
  const identities = new Set([sender.role, webhook.role, migration.role, runtime.role]);
  if (identities.size !== 4 || [sender,webhook,runtime].some((row) => row.database !== migration.database)) {
    throw new Error("Outbound database principals must be distinct and target one database.");
  }
  const migrationConnection = parseMigrationDatabaseUrl(migrationUrl, process.env.NODE_ENV);
  const client = new pg.Client(migrationClientConfig(migrationConnection, process.env.NODE_ENV));
  await client.connect();
  try {
    await verifyMigrationConnectionTls(client, process.env.NODE_ENV);
    await client.query("BEGIN");
    await provisionOutboundPrincipal(client, "sender", sender.role, migration.database);
    await provisionOutboundPrincipal(client, "webhook", webhook.role, migration.database);
    await client.query("COMMIT");
    console.log("Outbound sender/webhook principals provisioned and verified.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
await main();
