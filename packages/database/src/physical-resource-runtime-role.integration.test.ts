import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface PgError extends Error {
  code?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_mgt_232_role_${suffix}`;
const runtimeRole = `valet_mgt_232_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;
let runtimePool: Pool;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

function runScript(args: string[], runtimeUrl?: string): void {
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: scopedUrl(),
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });
}

async function expectDenied(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as PgError).code).toBe("42501");
  }
}

interface Fixture {
  readonly adminMembershipId: string;
  readonly locationA: string;
  readonly locationB: string;
  readonly managerMembershipId: string;
  readonly organizationId: string;
  readonly zoneA: string;
  readonly zoneB: string;
}

async function fixture(): Promise<Fixture> {
  const fixtureSuffix = randomUUID();
  const organizationId = randomUUID();
  const adminUserId = randomUUID();
  const managerUserId = randomUUID();
  const adminMembershipId = randomUUID();
  const managerMembershipId = randomUUID();
  const locationA = randomUUID();
  const locationB = randomUUID();
  const zoneA = randomUUID();
  const zoneB = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,'Issue 232 org','ACTIVE','Asia/Amman',clock_timestamp())`,
    [organizationId],
  );
  await adminPool.query(
    `INSERT INTO organization_subscriptions(
       organization_id,plan_code,status,dashboard_access_enabled,
       report_exports_enabled,basic_branding_enabled,updated_at)
     VALUES($1,'PRO','ACTIVE',TRUE,FALSE,FALSE,clock_timestamp())`,
    [organizationId],
  );
  for (const [userId, email] of [
    [adminUserId, `admin-${fixtureSuffix}@test.invalid`],
    [managerUserId, `manager-${fixtureSuffix}@test.invalid`],
  ]) {
    await adminPool.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
      [userId, email],
    );
  }
  await adminPool.query(
    `INSERT INTO organization_memberships(
       id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp()),
           ($4,$2,$5,'LOCATION_MANAGER','ACTIVE',clock_timestamp())`,
    [adminMembershipId, organizationId, adminUserId, managerMembershipId, managerUserId],
  );
  await adminPool.query(
    `INSERT INTO locations(
       id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
     VALUES($1,$3,'Location A','A','A','Asia/Amman','JOD','ACTIVE',clock_timestamp()),
           ($2,$3,'Location B','B','B','Asia/Amman','JOD','ACTIVE',clock_timestamp())`,
    [locationA, locationB, organizationId],
  );
  await adminPool.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [organizationId, managerMembershipId, locationA],
  );
  await adminPool.query(
    `INSERT INTO parking_zones(
       id,organization_id,location_id,code,label,status,updated_at)
     VALUES($1,$3,$4,'ZA','Zone A','ACTIVE',clock_timestamp()),
           ($2,$3,$5,'ZB','Zone B','ACTIVE',clock_timestamp())`,
    [zoneA, zoneB, organizationId, locationA, locationB],
  );
  return {
    adminMembershipId,
    locationA,
    locationB,
    managerMembershipId,
    organizationId,
    zoneA,
    zoneB,
  };
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  runScript([prismaCli, "migrate", "deploy"]);
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  adminPool = new Pool({ connectionString: scopedUrl() });
  runtimePool = new Pool({ connectionString: runtimeUrl });
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("Issue #232 physical-resource runtime boundary", () => {
  it("denies direct runtime INSERT and exposes only reviewed create functions", async () => {
    await expectDenied(
      runtimePool.query(
        `INSERT INTO key_slots(id,organization_id,location_id,code,updated_at)
         VALUES($1,$2,$3,'DENIED',clock_timestamp())`,
        [randomUUID(), randomUUID(), randomUUID()],
      ),
    );
    await expectDenied(
      runtimePool.query(
        `INSERT INTO parking_spots(
           id,organization_id,location_id,code,label,updated_at)
         VALUES($1,$2,$3,'DENIED','Denied',clock_timestamp())`,
        [randomUUID(), randomUUID(), randomUUID()],
      ),
    );
    const grants = await adminPool.query<{ allowed: boolean; name: string }>(
      `SELECT function.proname AS name,
              has_function_privilege($1,function.oid,'EXECUTE') AS allowed
       FROM pg_proc AS function
       JOIN pg_namespace AS namespace ON namespace.oid=function.pronamespace
       WHERE namespace.nspname='public'
         AND function.proname LIKE 'management_physical_resource_%'
       ORDER BY function.proname`,
      [runtimeRole],
    );
    expect(grants.rows).toEqual([
      { allowed: false, name: "management_physical_resource_append_audit" },
      { allowed: false, name: "management_physical_resource_authorize_actor" },
      { allowed: true, name: "management_physical_resource_create_key_slot" },
      { allowed: true, name: "management_physical_resource_create_parking_spot" },
      { allowed: false, name: "management_physical_resource_find_replay" },
      { allowed: false, name: "management_physical_resource_guard_audit_event" },
    ]);
  });

  it("creates, persists, audits and reconciles an idempotent Key Slot", async () => {
    const f = await fixture();
    const operationId = randomUUID();
    const fingerprint = "a".repeat(64);
    const first = await runtimePool.query<{
      changed: boolean;
      resource_id: string;
      result_code: string;
    }>(
      `SELECT * FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
      [f.adminMembershipId, f.organizationId, f.locationA, operationId, fingerprint, "K-01"],
    );
    expect(first.rows[0]?.result_code).toBe("OK");
    expect(first.rows[0]?.changed).toBe(true);
    const replay = await runtimePool.query(
      `SELECT * FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
      [f.adminMembershipId, f.organizationId, f.locationA, operationId, fingerprint, "K-01"],
    );
    expect(replay.rows[0]).toMatchObject({
      changed: false,
      resource_id: first.rows[0]?.resource_id,
      result_code: "OK",
    });
    const persisted = await adminPool.query(
      `SELECT slot.code,slot.status::text AS status,audit.event_type,audit.metadata_json
       FROM key_slots AS slot
       JOIN audit_events AS audit ON audit.entity_id=slot.id
       WHERE slot.id=$1`,
      [first.rows[0]?.resource_id],
    );
    expect(persisted.rows[0]).toMatchObject({ code: "K-01", event_type: "KEY_SLOT_CREATED", status: "ACTIVE" });
    expect(persisted.rows[0]?.metadata_json).toMatchObject({ resourceCode: "K-01", resourceType: "KEY_SLOT" });
  });

  it("allows Location-scoped duplicate codes but rejects same-Location duplicates", async () => {
    const f = await fixture();
    const create = (locationId: string, op: string) =>
      runtimePool.query<{ result_code: string }>(
        `SELECT result_code FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
        [f.adminMembershipId, f.organizationId, locationId, op, "b".repeat(64), "K-01"],
      );
    expect((await create(f.locationA, randomUUID())).rows[0]?.result_code).toBe("OK");
    expect((await create(f.locationB, randomUUID())).rows[0]?.result_code).toBe("OK");
    expect((await create(f.locationA, randomUUID())).rows[0]?.result_code).toBe("RESOURCE_CODE_CONFLICT");
  });

  it("serializes concurrent exact-code creation to one resource and one audit", async () => {
    const f = await fixture();
    const create = (operationId: string) =>
      runtimePool.query<{ result_code: string }>(
        `SELECT result_code FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
        [f.adminMembershipId, f.organizationId, f.locationA, operationId, "f".repeat(64), "K-RACE"],
      );
    const results = await Promise.all([create(randomUUID()), create(randomUUID())]);
    expect(results.map((result) => result.rows[0]?.result_code).sort()).toEqual([
      "OK",
      "RESOURCE_CODE_CONFLICT",
    ]);
    const counts = await adminPool.query<{ audits: string; slots: string }>(
      `SELECT
         (SELECT count(*) FROM key_slots WHERE location_id=$1 AND code='K-RACE')::text AS slots,
         (SELECT count(*) FROM audit_events
          WHERE location_id=$1 AND event_type='KEY_SLOT_CREATED'
            AND metadata_json->>'resourceCode'='K-RACE')::text AS audits`,
      [f.locationA],
    );
    expect(counts.rows[0]).toEqual({ audits: "1", slots: "1" });
  });

  it("requires an ACTIVE same-Location zone and enforces LM Location grant", async () => {
    const f = await fixture();
    const call = (locationId: string, zoneId: string) =>
      runtimePool.query<{ result_code: string }>(
        `SELECT result_code FROM management_physical_resource_create_parking_spot(
           $1,$2,$3,$4,$5,$6,$7,$8)`,
        [f.managerMembershipId, f.organizationId, locationId, randomUUID(), "c".repeat(64), zoneId, "P-01", "Front 01"],
      );
    expect((await call(f.locationA, f.zoneA)).rows[0]?.result_code).toBe("OK");
    expect((await call(f.locationA, f.zoneB)).rows[0]?.result_code).toBe("PARKING_ZONE_INVALID");
    await expectDenied(call(f.locationB, f.zoneB));
  });

  it("rejects operation-id reuse with a different fingerprint", async () => {
    const f = await fixture();
    const operationId = randomUUID();
    await runtimePool.query(
      `SELECT * FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
      [f.adminMembershipId, f.organizationId, f.locationA, operationId, "d".repeat(64), "K-02"],
    );
    const conflict = await runtimePool.query<{ result_code: string }>(
      `SELECT result_code FROM management_physical_resource_create_key_slot($1,$2,$3,$4,$5,$6)`,
      [f.adminMembershipId, f.organizationId, f.locationA, operationId, "e".repeat(64), "K-02"],
    );
    expect(conflict.rows[0]?.result_code).toBe("IDEMPOTENCY_CONFLICT");
  });
});
