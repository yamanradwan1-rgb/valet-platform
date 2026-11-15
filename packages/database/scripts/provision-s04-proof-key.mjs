import "dotenv/config";
import pg from "pg";
import {
  assertDatabaseCredentialSeparation,
  decodedDatabaseIdentity,
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
  verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";

function readProofKey(environment) {
  const raw = environment.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) {
    throw new Error("S04 proof key must encode exactly 32 random bytes.");
  }
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== raw ||
      raw === environment.ANTI_ABUSE_HMAC_SECRET_B64URL) {
    throw new Error("S04 proof key must be valid and distinct from the identity key.");
  }
  return key;
}

export async function provisionS04ProofKey(environment = process.env) {
  const migration = parseMigrationDatabaseUrl(
    environment.MIGRATION_DATABASE_URL, environment.NODE_ENV,
  );
  const runtime = parseRuntimeDatabaseUrlForProvisioning(environment.DATABASE_URL);
  assertDatabaseCredentialSeparation(migration, runtime, environment.NODE_ENV);
  const migrator = decodedDatabaseIdentity(migration);
  const ordinary = decodedDatabaseIdentity(runtime);
  if (migrator.database !== ordinary.database ||
      migrator.host !== ordinary.host || migrator.port !== ordinary.port) {
    throw new Error("S04 proof key provisioner must target the runtime database.");
  }
  const key = readProofKey(environment);
  const client = new pg.Client(migrationClientConfig(migration, environment.NODE_ENV));
  await client.connect();
  try {
    await verifyMigrationConnectionTls(client, environment.NODE_ENV);
    await client.query("BEGIN");
    // The migration owner controls the table; ordinary runtime has no schema
    // access. Re-provisioning never replaces a live key or silently invalidates
    // existing signed requests.
    await client.query(
      `INSERT INTO s04_quota_guard.proof_key(singleton,key_material)
       VALUES(true,$1::bytea) ON CONFLICT(singleton) DO NOTHING`,
      [key],
    );
    const match = await client.query(
      "SELECT key_material=$1::bytea AS matches FROM s04_quota_guard.proof_key WHERE singleton",
      [key],
    );
    if (match.rows.length !== 1 || match.rows[0]?.matches !== true) {
      throw new Error("S04 proof key rotation requires a separately reviewed rollout.");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    key.fill(0);
    await client.end();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/provision-s04-proof-key.mjs")) {
  await provisionS04ProofKey();
}
