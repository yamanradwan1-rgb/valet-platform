import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl = process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const migration = "20260916003700_mgt_be_04_staff_roles_access";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const migrationsBeforeStaffManagement = expectedMigrationDirectories.slice(
  0,
  migrationIndex,
);
const databaseName = `valet_staff_mgt_preserve_${randomUUID().replaceAll("-", "")}`;
let client: Client;

const ids = {
  accountAudit: randomUUID(), audit: randomUUID(), factor: randomUUID(),
  location: randomUUID(), membership: randomUUID(), organization: randomUUID(),
  refresh: randomUUID(), session: randomUUID(), shift: randomUUID(),
  staffSession: randomUUID(), task: randomUUID(), user: randomUUID(), vehicle: randomUUID(),
};
const incidentSeed = randomUUID();
const incidentId = `${incidentSeed.slice(0, 14)}8${incidentSeed.slice(15)}`;

function scopedUrl(): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function apply(name: string): Promise<void> {
  await client.query(await readFile(new URL(`${name}/migration.sql`, migrationRoot), "utf8"));
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try { await bootstrap.query(`CREATE DATABASE "${databaseName}"`); }
  finally { await bootstrap.end(); }
  client = new Client({ connectionString: scopedUrl() });
  await client.connect();
  for (const name of migrationsBeforeStaffManagement) await apply(name);

  await client.query(
    `INSERT INTO organizations(id,name,timezone,updated_at)
     VALUES($1,'Preservation org','Asia/Amman',transaction_timestamp())`,
    [ids.organization],
  );
  await client.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES($1,$2,'Preservation location',$3,'Address','Asia/Amman','JOD',transaction_timestamp())`,
    [ids.location, ids.organization, `P-${ids.location}`],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'test-hash','ACTIVE',transaction_timestamp())`,
    [ids.user, `${ids.user}@preserve.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',transaction_timestamp())`,
    [ids.membership, ids.organization, ids.user],
  );
  await client.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [ids.organization, ids.membership, ids.location],
  );
  await client.query(
    `INSERT INTO user_mfa_totp_factors(id,user_id,state,protected_secret)
     VALUES($1,$2,'PENDING',$3)`,
    [ids.factor, ids.user, `mte1.${"a".repeat(16)}.${"b".repeat(24)}.${"c".repeat(22)}`],
  );
  await client.query(
    `INSERT INTO staff_auth_sessions
       (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,created_at,last_rotated_at)
     VALUES($1,$2,$3,clock_timestamp()+interval '15 minutes',clock_timestamp()+interval '30 days',clock_timestamp(),clock_timestamp());
     `,
    [ids.staffSession, ids.user, `staff-access-sha256:v1:${"a".repeat(64)}`],
  );
  await client.query(
    `INSERT INTO staff_refresh_credentials(id,session_id,token_hash,generation,created_at,expires_at)
     VALUES($1,$2,$3,1,clock_timestamp(),clock_timestamp()+interval '30 days')`,
    [ids.refresh, ids.staffSession, `staff-refresh-sha256:v1:${"b".repeat(64)}`],
  );
  await client.query(
    `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
     VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
    [ids.shift, ids.organization, ids.location, ids.membership],
  );
  await client.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,'PRESERVE',transaction_timestamp())`,
    [ids.vehicle, ids.organization],
  );
  await client.query(
    `INSERT INTO valet_sessions
       (id,customer_access_token_hash,customer_access_expires_at,organization_id,
        location_id,vehicle_id,state,checked_in_by_membership_id,version,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,
            'AWAITING_PARKING',$6,1,clock_timestamp())`,
    [ids.session, `disabled:preserve:${randomUUID()}`, ids.organization,
      ids.location, ids.vehicle, ids.membership],
  );
  await client.query(
    `INSERT INTO tasks
       (id,organization_id,location_id,valet_session_id,task_type,status,
        current_assignee_membership_id,version,updated_at)
     VALUES($1,$2,$3,$4,'PARKING','ASSIGNED',$5,1,clock_timestamp())`,
    [ids.task, ids.organization, ids.location, ids.session, ids.membership],
  );
  await client.query(
    `INSERT INTO incident_recovery_intents
       (incident_id,organization_id,location_id,valet_session_id,
        reporting_membership_id,created_at,expires_at)
     VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '15 minutes')`,
    [incidentId, ids.organization, ids.location, ids.session, ids.membership],
  );
  await client.query(
    `INSERT INTO audit_events
       (id,organization_id,location_id,valet_session_id,actor_membership_id,
        event_type,entity_type,entity_id,metadata_json,occurred_at)
     VALUES($1,$2,$3,$4,$5,'PRESERVATION_CANARY','TEST',$4,'{}',clock_timestamp())`,
    [ids.audit, ids.organization, ids.location, ids.session, ids.membership],
  );
  await client.query(
    `INSERT INTO account_security_audit_events
       (id,event_type,subject_user_id,actor_type,actor_user_id,occurred_at)
     VALUES($1,'PRESERVATION_CANARY',$2,'USER',$2,clock_timestamp())`,
    [ids.accountAudit, ids.user],
  );
  await apply(migration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try { await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
  finally { await bootstrap.end(); }
}, 60_000);

describe("MGT-BE-04 migration 37 upgrade preservation", () => {
  it("preserves pre-existing auth, access, operational and audit truth", async () => {
    const state = await client.query<{
      factor_state: string; intent_state: string; membership_role: string;
      membership_status: string; membership_version: number; session_state: string;
      session_version: number; shift_status: string; task_assignee: string | null;
      task_status: string; task_version: number; user_status: string;
    }>(
      `SELECT user_row.status::text AS user_status,
              membership.role::text AS membership_role,
              membership.status::text AS membership_status,
              membership.version AS membership_version,
              factor.state::text AS factor_state,shift_row.status::text AS shift_status,
              session.state::text AS session_state,session.version AS session_version,
              task.status::text AS task_status,task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee,
              intent.state::text AS intent_state
       FROM users AS user_row
       JOIN organization_memberships AS membership ON membership.id=$2
       JOIN user_mfa_totp_factors AS factor ON factor.id=$3
       JOIN shifts AS shift_row ON shift_row.id=$4
       JOIN valet_sessions AS session ON session.id=$5
       JOIN tasks AS task ON task.id=$6
       JOIN incident_recovery_intents AS intent
         ON intent.organization_id=$7 AND intent.incident_id=$8
       WHERE user_row.id=$1`,
      [ids.user, ids.membership, ids.factor, ids.shift, ids.session, ids.task,
        ids.organization, incidentId],
    );
    expect(state.rows[0]).toEqual({
      factor_state: "PENDING", intent_state: "RESERVED",
      membership_role: "VALET_EMPLOYEE", membership_status: "ACTIVE",
      membership_version: 1, session_state: "AWAITING_PARKING", session_version: 1,
      shift_status: "ACTIVE", task_assignee: ids.membership,
      task_status: "ASSIGNED", task_version: 1, user_status: "ACTIVE",
    });
    const counts = await client.query<Record<string, string>>(
      `SELECT
         (SELECT count(*)::text FROM membership_location_access WHERE membership_id=$1) AS grants,
         (SELECT count(*)::text FROM staff_auth_sessions WHERE id=$2 AND revoked_at IS NULL) AS sessions,
         (SELECT count(*)::text FROM staff_refresh_credentials WHERE id=$3) AS refreshes,
         (SELECT count(*)::text FROM audit_events WHERE id=$4 AND event_type='PRESERVATION_CANARY') AS audits,
         (SELECT count(*)::text FROM account_security_audit_events WHERE id=$5 AND event_type='PRESERVATION_CANARY') AS security_audits,
         (SELECT count(*)::text FROM audit_events WHERE entity_id=$1 AND event_type LIKE 'STAFF_%') AS staff_history`,
      [ids.membership, ids.staffSession, ids.refresh, ids.audit, ids.accountAudit],
    );
    expect(counts.rows[0]).toEqual({
      audits: "1", grants: "1", refreshes: "1",
      security_audits: "1", sessions: "1", staff_history: "0",
    });
  });
});
