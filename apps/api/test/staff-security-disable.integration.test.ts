import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { executeControlledSecurityDisable } from "../tools/security-disable/execution";
import type { SecurityDisableArguments } from "../tools/security-disable/types";
import { ShiftTestContext, type ShiftFixture } from "./shift-test-context";

const context = new ShiftTestContext("mgt_be_04_security_disable");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function environment(): NodeJS.ProcessEnv {
  return { MIGRATION_DATABASE_URL: context.migrationUrl, NODE_ENV: "test" };
}

function command(
  fixture: ShiftFixture,
  overrides: Partial<SecurityDisableArguments> = {},
): SecurityDisableArguments {
  return {
    operation: "disable-user",
    operationId: randomUUID(),
    operatorRef: "SECURITY-CASE-42",
    userId: fixture.userId,
    ...overrides,
  };
}

function recoveryIncidentId(): string {
  const id = randomUUID().split("");
  id[14] = "8";
  return id.join("");
}

async function seedSessionAndPush(fixture: ShiftFixture) {
  const sessionId = randomUUID();
  const registrationId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO staff_auth_sessions
       (id,user_id,current_access_token_hash,access_expires_at,absolute_expires_at,
        created_at,last_rotated_at)
     VALUES($1,$2,$3,clock_timestamp()+interval '15 minutes',
            clock_timestamp()+interval '30 days',clock_timestamp(),clock_timestamp())`,
    [sessionId, fixture.userId, `staff-access-sha256:v1:${"a".repeat(64)}`],
  );
  await context.adminPool.query(
    `INSERT INTO staff_refresh_credentials
       (id,session_id,token_hash,generation,created_at,expires_at)
     VALUES($1,$2,$3,1,clock_timestamp(),clock_timestamp()+interval '30 days')`,
    [
      randomUUID(),
      sessionId,
      `staff-refresh-sha256:v1:${"b".repeat(64)}`,
    ],
  );
  await context.adminPool.query(
    `INSERT INTO staff_push_registrations
       (id,staff_auth_session_id,provider,platform,app_identifier,installation_id,
        provider_token,token_hash,app_version,app_build,locale)
     VALUES($1,$2,'FCM','ANDROID','com.vaylet.employee',$3,$4,$5,'1.0.0','1','en')`,
    [
      registrationId,
      sessionId,
      randomUUID(),
      `provider-${randomUUID()}`,
      `staff-push-token-sha256:v1:${"c".repeat(64)}`,
    ],
  );
  return { registrationId, sessionId };
}

describe("MGT-BE-04 controlled Staff security disable", () => {
  it("globally disables access while preserving tenant and operational truth", async () => {
    const first = await context.createFixture({ role: "ORG_ADMIN" });
    const second = await context.createFixture(
      { role: "VALET_EMPLOYEE" },
      first.userId,
    );
    const session = await seedSessionAndPush(first);
    const shiftId = randomUUID();
    await context.adminPool.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
       VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
      [shiftId, second.organizationId, second.locationId, second.membershipId],
    );
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    const taskId = randomUUID();
    const keySlotId = randomUUID();
    const custodyEventId = randomUUID();
    const incidentId = recoveryIncidentId();
    await context.adminPool.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
       VALUES($1,$2,'SECURITY-DISABLE-LIVE-WORK',clock_timestamp())`,
      [vehicleId, second.organizationId],
    );
    await context.adminPool.query(
      `INSERT INTO key_slots(id,organization_id,location_id,code,updated_at)
       VALUES($1,$2,$3,$4,clock_timestamp())`,
      [keySlotId, second.organizationId, second.locationId, `K-${keySlotId}`],
    );
    await context.adminPool.query(
      `INSERT INTO valet_sessions
         (id,customer_access_token_hash,customer_access_expires_at,
          organization_id,location_id,vehicle_id,state,key_slot_id,
          checked_in_by_membership_id,version,updated_at)
       VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'PARKING',$6,$7,7,clock_timestamp())`,
      [
        sessionId,
        `disabled:intake:${randomUUID()}`,
        second.organizationId,
        second.locationId,
        vehicleId,
        keySlotId,
        second.membershipId,
      ],
    );
    await context.adminPool.query(
      `INSERT INTO tasks
         (id,organization_id,location_id,valet_session_id,task_type,status,
          current_assignee_membership_id,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,'PARKING','IN_PROGRESS',$5,4,clock_timestamp(),clock_timestamp())`,
      [taskId, second.organizationId, second.locationId, sessionId, second.membershipId],
    );
    await context.adminPool.query(
      `INSERT INTO key_custody_events
         (id,organization_id,location_id,valet_session_id,key_slot_id,
          actor_membership_id,event_type,occurred_at,created_at)
       VALUES($1,$2,$3,$4,$5,$6,'CHECKED_OUT',clock_timestamp(),clock_timestamp())`,
      [
        custodyEventId,
        second.organizationId,
        second.locationId,
        sessionId,
        keySlotId,
        second.membershipId,
      ],
    );
    await context.adminPool.query(
      `INSERT INTO incident_recovery_intents
         (incident_id,organization_id,location_id,valet_session_id,
          reporting_membership_id,state,created_at,expires_at)
       VALUES($1,$2,$3,$4,$5,'RESERVED',clock_timestamp(),clock_timestamp()+interval '15 minutes')`,
      [incidentId, second.organizationId, second.locationId, sessionId, second.membershipId],
    );
    const disable = command(first);

    await expect(
      executeControlledSecurityDisable(disable, environment()),
    ).resolves.toEqual({ operationId: disable.operationId, userId: first.userId });

    const user = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM users WHERE id=$1`,
      [first.userId],
    );
    expect(user.rows[0]?.status).toBe("DISABLED");
    const memberships = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM organization_memberships
       WHERE user_id=$1 ORDER BY organization_id`,
      [first.userId],
    );
    expect(memberships.rows.map((row) => row.status)).toEqual(["ACTIVE", "ACTIVE"]);
    const auth = await context.adminPool.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM staff_auth_sessions WHERE id=$1`,
      [session.sessionId],
    );
    expect(auth.rows[0]?.revoked_at).toBeInstanceOf(Date);
    const push = await context.adminPool.query<{
      provider_token: string | null;
      state: string;
      terminal_reason_class: string | null;
    }>(
      `SELECT state::text,provider_token,terminal_reason_class
       FROM staff_push_registrations WHERE id=$1`,
      [session.registrationId],
    );
    expect(push.rows[0]).toEqual({
      provider_token: null,
      state: "DISABLED",
      terminal_reason_class: "USER_SECURITY_DISABLED",
    });
    const shift = await context.adminPool.query<{ status: string }>(
      `SELECT status::text FROM shifts WHERE id=$1`,
      [shiftId],
    );
    expect(shift.rows[0]?.status).toBe("ACTIVE");
    const task = await context.adminPool.query<{
      current_assignee_membership_id: string | null;
      status: string;
      version: number;
    }>(
      `SELECT status::text,current_assignee_membership_id::text,version
       FROM tasks WHERE id=$1`,
      [taskId],
    );
    expect(task.rows[0]).toEqual({
      current_assignee_membership_id: second.membershipId,
      status: "IN_PROGRESS",
      version: 4,
    });
    const operational = await context.adminPool.query<{
      custody_type: string;
      intent_state: string;
      key_slot_id: string | null;
      session_state: string;
      session_version: number;
    }>(
      `SELECT session.state::text AS session_state,session.version AS session_version,
              session.key_slot_id::text,
              custody.event_type::text AS custody_type,
              intent.state::text AS intent_state
       FROM valet_sessions AS session
       INNER JOIN key_custody_events AS custody ON custody.id=$2
       INNER JOIN incident_recovery_intents AS intent
         ON intent.organization_id=session.organization_id AND intent.incident_id=$3
       WHERE session.id=$1`,
      [sessionId, custodyEventId, incidentId],
    );
    expect(operational.rows[0]).toEqual({
      custody_type: "CHECKED_OUT",
      intent_state: "RESERVED",
      key_slot_id: keySlotId,
      session_state: "PARKING",
      session_version: 7,
    });
    const fabricated = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM key_custody_events
       WHERE valet_session_id=$1 AND event_type IN ('RETURNED_TO_SLOT','SLOT_CLEARED','RELEASED')`,
      [sessionId],
    );
    expect(fabricated.rows[0]?.count).toBe("0");
    const tenantAudit = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=ANY($1::uuid[])`,
      [[first.organizationId, second.organizationId]],
    );
    expect(tenantAudit.rows[0]?.count).toBe("0");
  }, 30_000);

  it("converges exact retries and rejects operation-id fact changes", async () => {
    const fixture = await context.createFixture({ role: "ORG_ADMIN" });
    const disable = command(fixture);
    await executeControlledSecurityDisable(disable, environment());
    await expect(
      executeControlledSecurityDisable(disable, environment()),
    ).resolves.toEqual({ operationId: disable.operationId, userId: fixture.userId });
    await expect(
      executeControlledSecurityDisable(
        { ...disable, operatorRef: "DIFFERENT-CASE" },
        environment(),
      ),
    ).rejects.toThrow("operation identity conflict");
    const audit = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM account_security_audit_events
       WHERE id=$1 AND event_type='STAFF_USER_SECURITY_DISABLED'
         AND actor_type='CONTROLLED_OPERATOR'`,
      [disable.operationId],
    );
    expect(audit.rows[0]?.count).toBe("1");
  }, 30_000);
});
