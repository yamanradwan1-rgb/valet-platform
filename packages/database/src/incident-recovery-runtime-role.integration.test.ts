import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  expectIncidentRecoveryGuardRejectsPrivilegedWrites,
  seedIncidentRecoveryRuntimeFixture,
  type IncidentRecoveryRuntimeFixture,
} from "./incident-recovery-runtime-fixture";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_incident_recovery_${suffix}`;
const runtimeRole = `valet_incident_recovery_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let admin: Pool;
let runtime: Client;
let fixture: IncidentRecoveryRuntimeFixture;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

function run(
  command: string,
  args: string[],
  migrationUrl: string,
  runtimeUrl?: string,
) {
  execFileSync(command, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const migrationUrl = scopedUrl();
  run(process.execPath, [prismaCli, "migrate", "deploy"], migrationUrl);
  run(
    process.execPath,
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    scopedUrl(runtimeRole, runtimePassword),
  );
  admin = new Pool({ connectionString: migrationUrl });
  runtime = new Client({
    connectionString: scopedUrl(runtimeRole, runtimePassword),
  });
  await runtime.connect();
  fixture = await seedIncidentRecoveryRuntimeFixture(admin);
}, 120_000);

afterAll(async () => {
  await runtime?.end();
  await admin?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("DEC-077 runtime recovery-intent guard", () => {
  it("authors the 15-minute reservation and permits exactly one retirement", async () => {
    const before = Date.now();
    await runtime.query(
      `INSERT INTO incident_recovery_intents
         (incident_id,organization_id,location_id,valet_session_id,reporting_membership_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        fixture.incidentId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
      ],
    );
    const row = await runtime.query<{
      created_at: Date;
      expires_at: Date;
      retired_at: Date | null;
      state: string;
    }>(
      `SELECT created_at,expires_at,retired_at,state::text FROM incident_recovery_intents WHERE organization_id=$1 AND incident_id=$2`,
      [fixture.organizationId, fixture.incidentId],
    );
    expect(row.rows[0]!.state).toBe("RESERVED");
    expect(row.rows[0]!.retired_at).toBeNull();
    expect(row.rows[0]!.created_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(
      row.rows[0]!.expires_at.getTime() - row.rows[0]!.created_at.getTime(),
    ).toBe(15 * 60 * 1000);
    expect(
      (
        await runtime.query(
          `UPDATE incident_recovery_intents SET state='RETIRED' WHERE organization_id=$1 AND incident_id=$2`,
          [fixture.organizationId, fixture.incidentId],
        )
      ).rowCount,
    ).toBe(1);
    const retired = await runtime.query<{ retired_at: Date | null }>(
      `SELECT retired_at FROM incident_recovery_intents WHERE organization_id=$1 AND incident_id=$2`,
      [fixture.organizationId, fixture.incidentId],
    );
    expect(retired.rows[0]!.retired_at).not.toBeNull();
    await expect(
      runtime.query(
        `UPDATE incident_recovery_intents SET state='RESERVED' WHERE organization_id=$1 AND incident_id=$2`,
        [fixture.organizationId, fixture.incidentId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      runtime.query(
        `ALTER TABLE incident_recovery_intents DISABLE TRIGGER ALL`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      runtime.query(
        `ALTER FUNCTION incident_recovery_intent_guard() RENAME TO unsafe_guard`,
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("denies direct timestamp, binding, deletion, trigger and function authority", async () => {
    for (const statement of [
      `UPDATE incident_recovery_intents SET retired_at=NULL`,
      `UPDATE incident_recovery_intents SET created_at=clock_timestamp()`,
      `UPDATE incident_recovery_intents SET expires_at=clock_timestamp()`,
      `UPDATE incident_recovery_intents SET reporting_membership_id=$1`,
      `UPDATE incident_recovery_intents SET valet_session_id=$1`,
      `UPDATE incident_recovery_intents SET organization_id=$1`,
      `UPDATE incident_recovery_intents SET location_id=$1`,
      `UPDATE incident_recovery_intents SET incident_id=$1`,
      `DELETE FROM incident_recovery_intents`,
    ]) {
      await expect(
        runtime.query(
          statement,
          statement.includes("$1") ? [randomUUID()] : [],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      runtime.query(
        `INSERT INTO incident_recovery_intents
           (incident_id,organization_id,location_id,valet_session_id,
            reporting_membership_id,state)
         VALUES ($1,$2,$3,$4,$5,'RETIRED')`,
        [
          "018f1234-5678-8abc-9234-56789abcdef1",
          fixture.organizationId,
          fixture.locationId,
          fixture.sessionId,
          fixture.membershipId,
        ],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      runtime.query(
        `INSERT INTO incident_recovery_intents
           (incident_id,organization_id,location_id,valet_session_id,
            reporting_membership_id,retired_at)
         VALUES ($1,$2,$3,$4,$5,clock_timestamp())`,
        [
          "018f1234-5678-8abc-9234-56789abcdef2",
          fixture.organizationId,
          fixture.locationId,
          fixture.sessionId,
          fixture.membershipId,
        ],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    for (const invalidId of [
      randomUUID(),
      "018f1234-5678-8abc-7234-56789abcdef9",
    ]) {
      await expect(
        runtime.query(
          `INSERT INTO incident_recovery_intents
             (incident_id,organization_id,location_id,valet_session_id,
              reporting_membership_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            invalidId,
            fixture.organizationId,
            fixture.locationId,
            fixture.sessionId,
            fixture.membershipId,
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }
    const matrix = await admin.query<{
      can_delete: boolean;
      can_execute: boolean;
      can_trigger: boolean;
    }>(
      `SELECT has_table_privilege($1,'public.incident_recovery_intents','DELETE') AS can_delete,
              has_table_privilege($1,'public.incident_recovery_intents','TRIGGER') AS can_trigger,
              has_function_privilege($1,'public.incident_recovery_intent_guard()','EXECUTE') AS can_execute`,
      [runtimeRole],
    );
    expect(matrix.rows[0]).toEqual({
      can_delete: false,
      can_execute: false,
      can_trigger: false,
    });
    const publicExecute = await admin.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc AS function
         CROSS JOIN LATERAL aclexplode(
           COALESCE(function.proacl, acldefault('f', function.proowner))
         ) AS privilege
         WHERE function.oid = 'public.incident_recovery_intent_guard()'::regprocedure
           AND privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
       ) AS allowed`,
    );
    expect(publicExecute.rows[0]!.allowed).toBe(false);
  });

  it("converges concurrent retirement on one terminal transition", async () => {
    const incidentId = "018f1234-5678-8abc-9234-56789abcdef3";
    await runtime.query(
      `INSERT INTO incident_recovery_intents
         (incident_id,organization_id,location_id,valet_session_id,
          reporting_membership_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        incidentId,
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.membershipId,
      ],
    );
    const second = new Client({
      connectionString: scopedUrl(runtimeRole, runtimePassword),
    });
    await second.connect();
    try {
      const transitions = await Promise.all([
        runtime.query(
          `UPDATE incident_recovery_intents SET state='RETIRED'
           WHERE organization_id=$1 AND incident_id=$2 AND state='RESERVED'`,
          [fixture.organizationId, incidentId],
        ),
        second.query(
          `UPDATE incident_recovery_intents SET state='RETIRED'
           WHERE organization_id=$1 AND incident_id=$2 AND state='RESERVED'`,
          [fixture.organizationId, incidentId],
        ),
      ]);
      expect(transitions.map((result) => result.rowCount).sort()).toEqual([
        0, 1,
      ]);
      await expect(
        runtime.query(
          `UPDATE incident_recovery_intents SET state='RETIRED'
           WHERE organization_id=$1 AND incident_id=$2`,
          [fixture.organizationId, incidentId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await second.end();
    }
  });

  it("makes the migration-owned guard reject invalid privileged writes", async () => {
    await expectIncidentRecoveryGuardRejectsPrivilegedWrites(admin, fixture);
  });
});
