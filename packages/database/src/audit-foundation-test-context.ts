import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";

export const auditTestBaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);

function databaseUrl(name: string): string {
  const url = new URL(auditTestBaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function createAuditTestDatabase(
  name: string,
  clients: Client[],
): Promise<Client> {
  const bootstrap = new Client({ connectionString: auditTestBaseUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${name}"`);
  } finally {
    await bootstrap.end();
  }
  const client = new Client({ connectionString: databaseUrl(name) });
  await client.connect();
  clients.push(client);
  return client;
}

export async function dropAuditTestDatabases(names: string[]): Promise<void> {
  const bootstrap = new Client({ connectionString: auditTestBaseUrl });
  await bootstrap.connect();
  try {
    for (const name of names) {
      await bootstrap.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
  } finally {
    await bootstrap.end();
  }
}

export async function applyAuditMigration(
  client: Client,
  name: string,
): Promise<void> {
  const sql = await readFile(
    new URL(`${name}/migration.sql`, migrationRoot),
    "utf8",
  );
  await client.query(sql);
}

export async function applyAuditMigrations(
  client: Client,
  migrations: readonly string[],
): Promise<void> {
  for (const migration of migrations)
    await applyAuditMigration(client, migration);
}

export interface AuditFoundationFixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  userId: string;
}

export async function createAuditFoundationFixture(
  client: Client,
  userId = randomUUID(),
): Promise<AuditFoundationFixture> {
  const fixture = {
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: randomUUID(),
    userId,
  };
  await client.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, $2, 'UTC', transaction_timestamp())`,
    [fixture.organizationId, `Audit tenant ${randomUUID()}`],
  );
  await client.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        updated_at)
     VALUES ($1, $2, 'Audit location', $3, 'Address', 'UTC', 'JOD',
             transaction_timestamp())`,
    [fixture.locationId, fixture.organizationId, randomUUID()],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'test-hash', transaction_timestamp())
     ON CONFLICT (id) DO NOTHING`,
    [userId, `${userId}@audit.invalid`],
  );
  await client.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, updated_at)
     VALUES ($1, $2, $3, 'ORG_ADMIN', transaction_timestamp())`,
    [fixture.membershipId, fixture.organizationId, userId],
  );
  return fixture;
}
