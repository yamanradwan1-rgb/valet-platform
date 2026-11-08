import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { DatabaseStaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import { Phase4RetrievalCancellationTestContext } from "./phase4-retrieval-cancellation-test-context";

export type Issue442LocationTestContext =
  Phase4RetrievalCancellationTestContext;

export function createIssue442LocationContext(label: string) {
  return new Phase4RetrievalCancellationTestContext(
    `issue442_location_order_${label}`,
  );
}

export interface RaceFixture {
  readonly adminRefreshToken: string;
  readonly adminSessionId: string;
  readonly adminToken: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly initialOwner: string;
  readonly initialTaskVersion: number;
  readonly initialSessionVersion: number;
  readonly newOwner: string;
  readonly transfer: {
    readonly expectedVersion: number;
    readonly operationId: string;
    readonly reason: string;
    readonly targetAssigneeMembershipId: string;
  };
  readonly stop: { readonly expectedUpdatedAt: string };
}

/** All HTTP operations below use real Staff sessions and a disposable migrated DB. */
export async function prepare(
  context: Issue442LocationTestContext,
): Promise<RaceFixture> {
  const parked = await context.createParkedFixture();
  const requested = await context.requestRetrieval(parked);
  const assigned = await context.assign(requested, true);
  const started = await context.staffPost(
    assigned.accessToken,
    `/v1/staff/valet-sessions/${assigned.sessionId}/start-retrieval`,
    {
      expectedSessionVersion: assigned.sessionVersion,
      expectedTaskVersion: assigned.taskVersion,
    },
  );
  expect(started.status).toBe(200);

  const admin = await context.addMember(assigned, "ORG_ADMIN", false);
  const adminToken = await context.authorize(admin.userId);
  const credential = await new DatabaseStaffSessionContextResolver(
    context.runtimePool,
  ).resolve(`Bearer ${adminToken}`);
  const adminRefreshToken = generateStaffCredential("vsr1.");
  await context.adminPool.query(
    `INSERT INTO staff_refresh_credentials
       (id,session_id,token_hash,generation,created_at,expires_at)
     VALUES ($1,$2,$3,1,clock_timestamp(),clock_timestamp()+interval '30 minutes')`,
    [
      randomUUID(),
      credential.staffAuthSessionId,
      staffCredentialHash("refresh", adminRefreshToken),
    ],
  );
  const factorId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO user_mfa_totp_factors
       (id,user_id,state,protected_secret,last_accepted_step,
        recovery_set_generation,activated_at)
     VALUES ($1,$2,'ACTIVE',$3,1,1,clock_timestamp())`,
    [
      factorId,
      admin.userId,
      `mte1.${"a".repeat(16)}.${"b".repeat(32)}.${"c".repeat(22)}`,
    ],
  );
  await context.adminPool.query(
    `UPDATE staff_auth_sessions SET mfa_factor_id=$2,
       mfa_authenticated_at=clock_timestamp(),
       last_admin_activity_at=clock_timestamp() WHERE id=$1`,
    [credential.staffAuthSessionId, factorId],
  );
  await context.adminPool.query(
    `UPDATE organization_subscriptions
     SET status='ACTIVE',dashboard_access_enabled=TRUE
     WHERE organization_id=$1`,
    [assigned.organizationId],
  );
  const replacement = await context.addOperationalMember(
    assigned,
    "VALET_EMPLOYEE",
  );
  const state = await context.adminPool.query<{
    assignee: string;
    task_version: number;
    session_version: number;
    updated_at: Date;
  }>(
    `SELECT task.current_assignee_membership_id::text AS assignee,
            task.version AS task_version, session.version AS session_version,
            location.updated_at
     FROM tasks AS task
     JOIN valet_sessions AS session ON session.id=task.valet_session_id
     JOIN locations AS location ON location.id=session.location_id
     WHERE task.id=$1`,
    [assigned.taskId],
  );
  const row = state.rows[0]!;
  return {
    adminRefreshToken,
    adminSessionId: credential.staffAuthSessionId,
    adminToken,
    initialOwner: row.assignee,
    initialSessionVersion: row.session_version,
    initialTaskVersion: row.task_version,
    locationId: assigned.locationId,
    newOwner: replacement.membershipId,
    organizationId: assigned.organizationId,
    sessionId: assigned.sessionId,
    taskId: assigned.taskId,
    stop: { expectedUpdatedAt: row.updated_at.toISOString() },
    transfer: {
      expectedVersion: row.task_version,
      operationId: randomUUID(),
      reason: "Issue 442 Emergency and Location ordering regression",
      targetAssigneeMembershipId: replacement.membershipId,
    },
  };
}

/** A committed-domain snapshot: useful for asserting denied requests changed nothing. */
export async function effects(
  context: Issue442LocationTestContext,
  f: RaceFixture,
) {
  const result = await context.adminPool.query<{
    task_version: number;
    session_version: number;
    owner: string;
    session_state: string;
    accepting_intake: boolean;
    updated_at: Date;
    dispatch_count: number;
    audit_count: number;
    receipt_count: number;
    stop_audit_count: number;
  }>(
    `SELECT task.version AS task_version,session.version AS session_version,
            task.current_assignee_membership_id::text AS owner,
            session.state::text AS session_state,
            location.accepting_intake,location.updated_at,
            (SELECT count(*)::int FROM dispatch_events
             WHERE task_id=task.id AND event_type='EMERGENCY_TAKEOVER') AS dispatch_count,
            (SELECT count(*)::int FROM audit_events
             WHERE entity_type='Task' AND entity_id=task.id
               AND event_type='TASK_EMERGENCY_TAKEOVER') AS audit_count,
            (SELECT count(*)::int FROM emergency_task_takeover_operations
             WHERE task_id=task.id) AS receipt_count,
            (SELECT count(*)::int FROM audit_events
             WHERE location_id=location.id
               AND event_type='LOCATION_INTAKE_STOPPED') AS stop_audit_count
     FROM tasks AS task
     JOIN valet_sessions AS session ON session.id=task.valet_session_id
     JOIN locations AS location ON location.id=session.location_id
     WHERE task.id=$1`,
    [f.taskId],
  );
  return result.rows[0]!;
}

/** Real lifecycle writers advance the Location CAS and restore intake to TRUE. */
export async function makeStaleStop(
  context: Issue442LocationTestContext,
  f: RaceFixture,
) {
  const path = `/v1/staff/management/organizations/${f.organizationId}/locations/${f.locationId}`;
  const first = await context.staffPost(
    f.adminToken,
    `${path}/stop-intake`,
    f.stop,
  );
  expect(first).toMatchObject({
    status: 201,
    body: { acceptingIntake: false },
  });
  const resumed = await context.staffPost(
    f.adminToken,
    `${path}/resume-intake`,
    { expectedUpdatedAt: String(first.body.updatedAt) },
  );
  expect(resumed).toMatchObject({
    status: 201,
    body: { acceptingIntake: true },
  });
  return String(resumed.body.updatedAt);
}

/** Keep the real lifecycle advisory lock until both HTTP writers are queued. */
export async function holdLocationLifecycle(
  context: Issue442LocationTestContext,
  locationId: string,
) {
  const barrier = await context.adminPool.connect();
  try {
    await barrier.query("BEGIN");
    await barrier.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('location-lifecycle:' || $1::text,0))`,
      [locationId],
    );
    const result = await barrier.query<{ pid: number }>(
      "SELECT pg_backend_pid() AS pid",
    );
    return { barrier, pid: result.rows[0]!.pid };
  } catch (error) {
    await barrier.query("ROLLBACK").catch(() => undefined);
    barrier.release();
    throw error;
  }
}
