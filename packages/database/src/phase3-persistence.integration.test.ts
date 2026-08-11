import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPhase3Slot,
  createPhase3Spot,
} from "./phase3-persistence-fixture.js";

interface Scope {
  locationId: string;
  membershipId: string;
  organizationId: string;
}

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_005a_${process.pid}_${Date.now()}`;
const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations", import.meta.url),
);
let client: Client;

function databaseUrl(name: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function expectConstraint(
  operation: Promise<unknown>,
  constraint: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL constraint failure.");
  } catch (error) {
    const pgError = error as PgError;
    expect(["23503", "23505", "23514"]).toContain(pgError.code);
    expect(pgError.constraint).toBe(constraint);
  }
}

async function createScope(
  organizationId: string = randomUUID(),
): Promise<Scope> {
  const locationId = randomUUID();
  const membershipId = randomUUID();
  const userId = randomUUID();
  await client.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, $2, 'Asia/Amman', transaction_timestamp())
     ON CONFLICT (id) DO NOTHING`,
    [organizationId, `Organization ${organizationId}`],
  );
  await client.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency, updated_at)
     VALUES ($1, $2, 'Location', $3, 'Address', 'Asia/Amman', 'JOD', transaction_timestamp())`,
    [locationId, organizationId, randomUUID()],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'test-hash', transaction_timestamp())`,
    [userId, `${userId}@phase3.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, updated_at)
     VALUES ($1, $2, $3, 'VALET_EMPLOYEE', transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  return { locationId, membershipId, organizationId };
}

async function createZone(scope: Scope, code = randomUUID()): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO parking_zones
       (id, organization_id, location_id, code, label, updated_at)
     VALUES ($1, $2, $3, $4, 'Zone', transaction_timestamp())`,
    [id, scope.organizationId, scope.locationId, code],
  );
  return id;
}

async function createSession(
  scope: Scope,
  zoneId: string | null = null,
  spotId: string | null = null,
  slotId: string | null = null,
): Promise<string> {
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  await client.query(
    `INSERT INTO vehicles (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, 'Test vehicle', transaction_timestamp())`,
    [vehicleId, scope.organizationId],
  );
  await client.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state, parking_zone_id,
        parking_spot_id, key_slot_id, checked_in_by_membership_id, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 hour', $3, $4, $5,
             'AWAITING_PARKING', $6, $7, $8, $9, transaction_timestamp())`,
    [
      sessionId,
      randomUUID(),
      scope.organizationId,
      scope.locationId,
      vehicleId,
      zoneId,
      spotId,
      slotId,
      scope.membershipId,
    ],
  );
  return sessionId;
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  client = new Client({ connectionString: databaseUrl(databaseName) });
  await client.connect();
  const directories = (await readdir(migrationsPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const directory of directories) {
    await client.query(
      await readFile(join(migrationsPath, directory, "migration.sql"), "utf8"),
    );
  }
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("DEC-031 parking and key custody integrity", () => {
  it("enforces Zone and Spot Location scope while retaining Zone-null Spots", async () => {
    const first = await createScope();
    const secondLocation = await createScope(first.organizationId);
    const foreign = await createScope();
    const code = randomUUID();
    const zone = await createZone(first, code);
    await expectConstraint(
      createZone(first, code),
      "parking_zones_location_id_code_key",
    );
    await expect(createZone(secondLocation, code)).resolves.toBeDefined();
    await expectConstraint(
      client.query(
        `INSERT INTO parking_zones
           (id, organization_id, location_id, code, label, updated_at)
         VALUES ($1, $2, $3, $4, 'Invalid', transaction_timestamp())`,
        [randomUUID(), first.organizationId, foreign.locationId, randomUUID()],
      ),
      "parking_zones_org_location_id_fkey",
    );
    await expect(createPhase3Spot(client, first, null)).resolves.toBeDefined();
    await expect(createPhase3Spot(client, first, zone)).resolves.toBeDefined();
    const otherZone = await createZone(secondLocation);
    await expectConstraint(
      createPhase3Spot(client, first, otherZone),
      "parking_spots_org_location_zone_id_fkey",
    );
    const foreignZone = await createZone(foreign);
    await expectConstraint(
      createPhase3Spot(client, first, foreignZone),
      "parking_spots_org_location_zone_id_fkey",
    );
  });

  it("enforces exact session Zone/Spot pairing and current exclusivity", async () => {
    const scope = await createScope();
    const zone = await createZone(scope);
    const otherZone = await createZone(scope);
    const spot = await createPhase3Spot(client, scope, zone);
    const slot = await createPhase3Slot(client, scope);
    await expect(createSession(scope, zone)).resolves.toBeDefined();
    await expectConstraint(
      createSession(scope, null, spot),
      "valet_sessions_parking_spot_requires_zone_check",
    );
    await expectConstraint(
      createSession(scope, otherZone, spot),
      "valet_sessions_org_location_zone_parking_spot_id_fkey",
    );
    await createSession(scope, zone, spot, slot);
    await expectConstraint(
      createSession(scope, zone, null, slot),
      "valet_sessions_key_slot_id_key",
    );
    await expectConstraint(
      createSession(scope, zone, spot),
      "valet_sessions_parking_spot_id_key",
    );
    await expect(createSession(scope)).resolves.toBeDefined();
    await expect(createSession(scope)).resolves.toBeDefined();
  });

  it("enforces custody scope, slot requirements and deterministic history", async () => {
    const scope = await createScope();
    const otherLocation = await createScope(scope.organizationId);
    const foreign = await createScope();
    const session = await createSession(scope);
    const slot = await createPhase3Slot(client, scope);
    const otherSlot = await createPhase3Slot(client, otherLocation);
    const insert = (
      type: string,
      keySlotId: string | null,
      actor = scope.membershipId,
      organization = scope.organizationId,
      location = scope.locationId,
    ) =>
      client.query(
        `INSERT INTO key_custody_events
         (id, organization_id, location_id, valet_session_id, key_slot_id,
          actor_membership_id, event_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7::key_custody_event_type)`,
        [randomUUID(), organization, location, session, keySlotId, actor, type],
      );
    await expect(insert("SLOT_ASSIGNED", slot)).resolves.toMatchObject({
      rowCount: 1,
    });
    for (const type of [
      "SLOT_ASSIGNED",
      "CHECKED_OUT",
      "RETURNED_TO_SLOT",
      "SLOT_CLEARED",
    ]) {
      await expectConstraint(
        insert(type, null),
        "key_custody_events_slot_required_check",
      );
    }
    await expect(insert("RELEASED", null)).resolves.toMatchObject({
      rowCount: 1,
    });
    await expectConstraint(
      insert("RETURNED_TO_SLOT", otherSlot),
      "key_custody_events_org_location_key_slot_id_fkey",
    );
    await expectConstraint(
      insert("SLOT_CLEARED", slot, foreign.membershipId),
      "key_custody_events_org_actor_membership_id_fkey",
    );
    await expectConstraint(
      insert(
        "SLOT_CLEARED",
        slot,
        foreign.membershipId,
        foreign.organizationId,
        foreign.locationId,
      ),
      "key_custody_events_org_location_session_id_fkey",
    );
    const index = await client.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
       AND indexname = 'key_custody_events_valet_session_id_occurred_at_id_idx'`,
    );
    expect(index.rowCount).toBe(1);
  });
});
