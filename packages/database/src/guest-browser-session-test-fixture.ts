import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { Client } from "pg";

export const guestBrowserT1Migration =
  "20261007007000_guest_browser_session_continuity";

export const databaseAdminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";

const migrationRoot = new URL("../prisma/migrations/", import.meta.url);

export interface DisposableDatabase {
  databaseName: string;
  databaseUrl: string;
}

export interface SeededSession {
  locationId: string;
  membershipId: string;
  organizationId: string;
  sessionId: string;
  vehicleId: string;
}

interface T1SessionOptions {
  consumed?: boolean;
  expiresIn?: string;
  generation?: number;
  revoked?: boolean;
  state?: "COMPLETED" | "PARKED";
}

export function hashGuestSecret(raw: string): string {
  return `sha256:v1:${createHash("sha256").update(raw).digest("hex")}`;
}

export function databaseUrlFor(databaseName: string): string {
  const url = new URL(databaseAdminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function createDisposableDatabase(
  prefix: string,
): Promise<DisposableDatabase> {
  const suffix = randomUUID().replaceAll("-", "");
  const databaseName = `${prefix}_${suffix}`;
  const bootstrap = new Client({ connectionString: databaseAdminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  return { databaseName, databaseUrl: databaseUrlFor(databaseName) };
}

export async function dropDisposableDatabase(
  databaseName: string,
): Promise<void> {
  const bootstrap = new Client({ connectionString: databaseAdminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
  } finally {
    await bootstrap.end();
  }
}

export async function applyMigration(
  client: Client,
  name: string,
): Promise<void> {
  const sql = await readFile(
    new URL(`${name}/migration.sql`, migrationRoot),
    "utf8",
  );
  await client.query(sql);
}

export async function applyBaselineMigrations(client: Client): Promise<void> {
  const directories = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter(
      (entry) => entry.isDirectory() && entry.name < guestBrowserT1Migration,
    )
    .map((entry) => entry.name)
    .sort();
  for (const name of directories) await applyMigration(client, name);
}

async function seedSessionParents(
  client: Client,
  label: string,
): Promise<SeededSession> {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  await client.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,$2,'ACTIVE','Asia/Amman',clock_timestamp())`,
    [organizationId, `T1 ${label}`],
  );
  await client.query(
    `INSERT INTO locations(
       id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES($1,$2,$3,$4,'Address','Asia/Amman','JOD',clock_timestamp())`,
    [
      locationId,
      organizationId,
      `T1 ${label}`,
      `T1-${label}-${locationId.slice(0, 6)}`,
    ],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [userId, `${userId}@t1.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships(
       id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [membershipId, organizationId, userId],
  );
  await client.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,clock_timestamp())`,
    [vehicleId, organizationId, `T1 ${label}`],
  );
  return { locationId, membershipId, organizationId, sessionId, vehicleId };
}

export async function seedPreT1Session(
  client: Client,
  label: string,
  tokenHash: string,
): Promise<SeededSession> {
  const ids = await seedSessionParents(client, label);
  await client.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,organization_id,
       location_id,vehicle_id,state,checked_in_by_membership_id,completed_at,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'COMPLETED',$6,
            clock_timestamp(),clock_timestamp())`,
    [
      ids.sessionId,
      tokenHash,
      ids.organizationId,
      ids.locationId,
      ids.vehicleId,
      ids.membershipId,
    ],
  );
  return ids;
}

export async function seedT1Session(
  client: Client,
  label: string,
  rawToken: string,
  options: T1SessionOptions = {},
): Promise<SeededSession> {
  const ids = await seedSessionParents(client, label);
  const state = options.state ?? "COMPLETED";
  await client.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,
       customer_access_revoked_at,customer_access_generation,customer_access_consumed_at,
       organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
       completed_at,updated_at)
     VALUES($1,$2,clock_timestamp()+$3::interval,$4,$5,$6,$7,$8,$9,$10,$11,$12,
            clock_timestamp())`,
    [
      ids.sessionId,
      hashGuestSecret(rawToken),
      options.expiresIn ?? "1 hour",
      options.revoked ? new Date() : null,
      options.generation ?? 1,
      options.consumed ? new Date() : null,
      ids.organizationId,
      ids.locationId,
      ids.vehicleId,
      state,
      ids.membershipId,
      state === "COMPLETED" ? new Date() : null,
    ],
  );
  return ids;
}
