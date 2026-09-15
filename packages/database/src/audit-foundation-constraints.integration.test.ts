import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const baseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_audit_constraints_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(baseUrl);
databaseUrl.pathname = `/${databaseName}`;
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);

let client: Client;
const ids = {
  organization1: randomUUID(),
  organization2: randomUUID(),
  location1: randomUUID(),
  location2: randomUUID(),
  user: randomUUID(),
  membership1: randomUUID(),
  membership2: randomUUID(),
  vehicle: randomUUID(),
  session: randomUUID(),
};

async function insertAudit(input: {
  organizationId?: string;
  locationId?: string | null;
  sessionId?: string | null;
  membershipId?: string | null;
  actorType?: string | null;
  operatorRef?: string | null;
}) {
  return client.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, actor_type, controlled_operator_ref,
        event_type, entity_type, entity_id, metadata_json, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'TEST_AUDIT','TestEntity',$8,'{}'::jsonb,
             transaction_timestamp())`,
    [
      randomUUID(),
      input.organizationId ?? ids.organization1,
      input.locationId === undefined ? ids.location1 : input.locationId,
      input.sessionId ?? null,
      input.membershipId ?? null,
      input.actorType ?? null,
      input.operatorRef ?? null,
      randomUUID(),
    ],
  );
}

async function insertAccountAudit(input: {
  actorType: string;
  subjectUserId?: string | null;
  actorUserId?: string | null;
  operatorRef?: string | null;
}) {
  return client.query(
    `INSERT INTO account_security_audit_events
       (id,event_type,subject_user_id,actor_type,actor_user_id,
        controlled_operator_ref,occurred_at)
     VALUES ($1,'TEST_ACCOUNT_SECURITY',$2,$3,$4,$5,transaction_timestamp())`,
    [
      randomUUID(),
      input.subjectUserId === undefined ? ids.user : input.subjectUserId,
      input.actorType,
      input.actorType === "USER" && input.actorUserId === undefined
        ? ids.user
        : (input.actorUserId ?? null),
      input.operatorRef ?? null,
    ],
  );
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: baseUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();

  client = new Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    await client.query(
      await readFile(
        new URL(`${migration}/migration.sql`, migrationRoot),
        "utf8",
      ),
    );
  }

  for (const [organizationId, name] of [
    [ids.organization1, "Audit tenant one"],
    [ids.organization2, "Audit tenant two"],
  ]) {
    await client.query(
      `INSERT INTO organizations (id,name,timezone,updated_at)
       VALUES ($1,$2,'Asia/Amman',transaction_timestamp())`,
      [organizationId, name],
    );
  }
  for (const [locationId, organizationId] of [
    [ids.location1, ids.organization1],
    [ids.location2, ids.organization2],
  ]) {
    await client.query(
      `INSERT INTO locations
         (id,organization_id,name,code,address_text,timezone,currency,updated_at)
       VALUES ($1,$2,'Audit location',$3,'Address','Asia/Amman','JOD',
               transaction_timestamp())`,
      [locationId, organizationId, randomUUID()],
    );
  }
  await client.query(
    `INSERT INTO users (id,email,password_hash,updated_at)
     VALUES ($1,$2,'test-hash',transaction_timestamp())`,
    [ids.user, `${ids.user}@audit.test`],
  );
  for (const [membershipId, organizationId] of [
    [ids.membership1, ids.organization1],
    [ids.membership2, ids.organization2],
  ]) {
    await client.query(
      `INSERT INTO organization_memberships
         (id,organization_id,user_id,role,updated_at)
       VALUES ($1,$2,$3,'LOCATION_MANAGER',transaction_timestamp())`,
      [membershipId, organizationId, ids.user],
    );
  }
  await client.query(
    `INSERT INTO vehicles (id,organization_id,temporary_descriptor,updated_at)
     VALUES ($1,$2,'Audit vehicle',transaction_timestamp())`,
    [ids.vehicle, ids.organization1],
  );
  await client.query(
    `INSERT INTO valet_sessions
       (id,customer_access_token_hash,customer_access_expires_at,
        organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
        updated_at)
     VALUES ($1,$2,transaction_timestamp()+interval '1 hour',$3,$4,$5,
             'CHECKING_IN',$6,transaction_timestamp())`,
    [
      ids.session,
      `audit-disabled:${randomUUID()}`,
      ids.organization1,
      ids.location1,
      ids.vehicle,
      ids.membership1,
    ],
  );
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: baseUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("MGT-BE-01 audit foundation constraints", () => {
  it("accepts truthful tenant Location and Organization-wide scopes", async () => {
    await expect(
      insertAudit({ membershipId: ids.membership1, actorType: "MEMBERSHIP" }),
    ).resolves.toBeDefined();
    await expect(
      insertAudit({ locationId: null, actorType: "SYSTEM" }),
    ).resolves.toBeDefined();
  });

  it("rejects cross-scope Location, session, and membership bindings", async () => {
    await expect(
      insertAudit({ locationId: ids.location2, actorType: "SYSTEM" }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertAudit({
        locationId: null,
        sessionId: ids.session,
        actorType: "SYSTEM",
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertAudit({ membershipId: ids.membership2, actorType: "MEMBERSHIP" }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it.each([
    ["MEMBERSHIP", ids.membership1, null],
    ["GUEST", null, null],
    ["SYSTEM", null, null],
    ["EXTERNAL_PROVIDER", null, null],
    ["CONTROLLED_OPERATOR", null, "operator:case-123"],
  ])(
    "accepts tenant actor provenance %s",
    async (actorType, membershipId, ref) => {
      await expect(
        insertAudit({ actorType, membershipId, operatorRef: ref }),
      ).resolves.toBeDefined();
    },
  );

  it("rejects missing controlled-operator provenance and new null actors", async () => {
    await expect(
      insertAudit({ actorType: "CONTROLLED_OPERATOR" }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(insertAudit({})).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps account-security audit outside Organization and Location scope", async () => {
    const result = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='account_security_audit_events'
         AND column_name IN ('organization_id','location_id')`,
    );
    expect(result.rows).toEqual([]);
  });

  it.each([
    ["USER", null],
    ["CONTROLLED_OPERATOR", "operator:recovery-42"],
    ["SYSTEM", null],
    ["ANONYMOUS", null],
  ])("accepts account-security actor %s", async (actorType, ref) => {
    await expect(
      insertAccountAudit({ actorType, operatorRef: ref }),
    ).resolves.toBeDefined();
  });

  it("enforces account-security User foreign keys", async () => {
    await expect(
      insertAccountAudit({ actorType: "SYSTEM", subjectUserId: randomUUID() }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertAccountAudit({ actorType: "USER", actorUserId: randomUUID() }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it.each([
    ["USER", null, null],
    ["USER", ids.user, "operator:invalid"],
    ["CONTROLLED_OPERATOR", null, null],
    ["CONTROLLED_OPERATOR", ids.user, "operator:invalid"],
    ["SYSTEM", ids.user, null],
    ["ANONYMOUS", null, "operator:invalid"],
  ])(
    "rejects invalid account actor combination %s/%s/%s",
    async (actorType, actorUserId, operatorRef) => {
      await expect(
        insertAccountAudit({ actorType, actorUserId, operatorRef }),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );

  it("records one account event for a User with memberships in two Organizations", async () => {
    const eventId = randomUUID();
    await client.query(
      `INSERT INTO account_security_audit_events
         (id,event_type,subject_user_id,actor_type,actor_user_id,occurred_at)
       VALUES ($1,'TEST_MULTI_ORG',$2,'USER',$2,transaction_timestamp())`,
      [eventId, ids.user],
    );
    const result = await client.query<{ audits: string; memberships: string }>(
      `SELECT
         (SELECT count(*)::text FROM organization_memberships WHERE user_id=$1) memberships,
         (SELECT count(*)::text FROM account_security_audit_events WHERE id=$2) audits`,
      [ids.user, eventId],
    );
    expect(result.rows[0]).toEqual({ audits: "1", memberships: "2" });
  });
});
