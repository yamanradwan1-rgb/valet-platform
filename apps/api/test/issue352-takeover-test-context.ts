import { createHash, randomUUID } from "node:crypto";

import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import type { DispatchMember } from "./dispatch-test-context";
import type { HandoffFixture } from "./handoff-test-context";
import type { StartParkingFixture } from "./start-parking-test-context";
import type { StartRetrievalFixture } from "./start-retrieval-test-context";
import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

export type TakeoverSourceFixture =
  | HandoffFixture
  | StartParkingFixture
  | StartRetrievalFixture;

export function takeoverTaskId(source: TakeoverSourceFixture): string {
  return "retrievalTaskId" in source ? source.retrievalTaskId : source.taskId;
}

export interface TakeoverSnapshot {
  readonly audit_count: number;
  readonly custody_count: number;
  readonly dispatch_count: number;
  readonly handoff_count: number;
  readonly raw_gps_count: number;
  readonly request_status: string | null;
  readonly session_state: string;
  readonly session_version: number;
  readonly task_assignee: string | null;
  readonly task_status: string;
  readonly task_version: number;
  readonly tracking_count: number;
}

/** Issue #352 uses the project's real migration-backed PostgreSQL fixture. */
export class Issue352TakeoverTestContext extends CompleteHandoffTestContext {
  constructor(label: string) {
    super(`issue352_${label}`);
  }

  async parking(legacyKeySlot = false): Promise<StartParkingFixture> {
    const source = await this.createStartParkingFixture({
      assignKey: legacyKeySlot,
      role: "VALET_EMPLOYEE",
    });
    await this.start(source, { session: legacyKeySlot ? 2 : 1, task: 3 });
    return source;
  }

  async retrieving(): Promise<StartRetrievalFixture> {
    const source = await this.createStartRetrievalFixture();
    await this.startRetrieval(source);
    return source;
  }

  async ready(): Promise<StartRetrievalFixture> {
    const source = await this.retrieving();
    await this.markReady(source);
    return source;
  }

  async verifiedHandoff(): Promise<HandoffFixture> {
    return this.prepareStandard("PICKUP_CODE");
  }

  async actors(source: TakeoverSourceFixture) {
    const initiator = await this.addMember(source, "VALET_SUPERVISOR");
    const replacement = await this.addMember(source, "VALET_EMPLOYEE");
    const admin = await this.addMember(source, "ORG_ADMIN", false);
    return { admin, initiator, replacement };
  }

  async request(
    source: TakeoverSourceFixture,
    actor: DispatchMember,
    replacement: DispatchMember,
    reason = "Emergency transfer to an available employee",
  ) {
    const taskId = takeoverTaskId(source);
    const snapshot = await this.snapshot(taskId);
    return {
      taskId,
      operationId: randomUUID(),
      expectedVersion: snapshot.task_version,
      staffSessionContext: await this.credential(actor.userId),
      targetAssigneeMembershipId: replacement.membershipId,
      reason,
    };
  }

  async credential(userId: string, assured = false): Promise<StaffSessionContext> {
    const staffAuthSessionId = randomUUID();
    const accessTokenHash = `staff-access-sha256:v1:${createHash("sha256")
      .update(randomUUID())
      .digest("hex")}`;
    const factorId = assured ? randomUUID() : null;
    if (factorId !== null) {
      await this.adminPool.query(
        `INSERT INTO user_mfa_totp_factors
           (id, user_id, state, protected_secret, last_accepted_step,
            recovery_set_generation, activated_at)
         VALUES ($1, $2, 'ACTIVE', $3, 1, 1, clock_timestamp())`,
        [factorId, userId, `mte1.${"a".repeat(16)}.${"b".repeat(32)}.${"c".repeat(22)}`],
      );
    }
    const inserted = await this.adminPool.query<{ created_at: Date }>(
      `WITH clock AS (SELECT clock_timestamp() AS moment)
       INSERT INTO staff_auth_sessions
         (id, user_id, current_access_token_hash, access_expires_at,
          absolute_expires_at, created_at, last_rotated_at,
          mfa_factor_id, mfa_authenticated_at, last_admin_activity_at)
       SELECT $1, $2, $3, clock.moment + interval '15 minutes',
              clock.moment + interval '30 days', clock.moment, clock.moment,
              $4::uuid,
              CASE WHEN $4::uuid IS NULL THEN NULL ELSE clock.moment END,
              CASE WHEN $4::uuid IS NULL THEN NULL ELSE clock.moment END
       FROM clock RETURNING created_at`,
      [staffAuthSessionId, userId, accessTokenHash, factorId],
    );
    const createdAt = inserted.rows[0]?.created_at;
    if (createdAt === undefined) {
      throw new Error("Expected a persisted issue352 Staff session.");
    }
    return { accessTokenHash, createdAt, staffAuthSessionId, userId };
  }

  async snapshot(taskId: string): Promise<TakeoverSnapshot> {
    const result = await this.adminPool.query<TakeoverSnapshot>(
      `SELECT task.status::text AS task_status, task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee,
              session.state::text AS session_state,
              session.version AS session_version,
              (SELECT request.status::text FROM retrieval_requests AS request
               WHERE request.valet_session_id = session.id
               ORDER BY request.requested_at DESC LIMIT 1) AS request_status,
              (SELECT count(*)::int FROM dispatch_events
               WHERE task_id = task.id) AS dispatch_count,
              (SELECT count(*)::int FROM audit_events
               WHERE entity_type = 'Task' AND entity_id = task.id)
                AS audit_count,
              (SELECT count(*)::int FROM key_custody_events
               WHERE valet_session_id = session.id) AS custody_count,
              (SELECT count(*)::int FROM handoff_verifications
               WHERE valet_session_id = session.id) AS handoff_count,
              (SELECT count(*)::int FROM task_tracking_sessions
               WHERE task_id = task.id) AS tracking_count,
              (SELECT count(*)::int FROM raw_gps_samples AS sample
               INNER JOIN task_tracking_sessions AS tracker
                 ON tracker.id = sample.tracking_session_id
               WHERE tracker.task_id = task.id) AS raw_gps_count
       FROM tasks AS task
       INNER JOIN valet_sessions AS session ON session.id = task.valet_session_id
       WHERE task.id = $1`,
      [taskId],
    );
    if (result.rows.length !== 1) {
      throw new Error("Expected exactly one owned issue352 Task fixture.");
    }
    return result.rows[0]!;
  }

  async custodyHistory(sessionId: string) {
    const result = await this.adminPool.query<{
      actor_membership_id: string;
      event_type: string;
      id: string;
      key_slot_id: string | null;
    }>(
      `SELECT id::text, event_type::text, actor_membership_id::text,
              key_slot_id::text FROM key_custody_events
       WHERE valet_session_id = $1 ORDER BY occurred_at, id`,
      [sessionId],
    );
    return result.rows;
  }

  async handoffHistory(sessionId: string) {
    const result = await this.adminPool.query<{
      consumed_at: Date | null;
      id: string;
      verified_at: Date | null;
    }>(
      `SELECT id::text, verified_at, consumed_at
       FROM handoff_verifications WHERE valet_session_id = $1
       ORDER BY created_at, id`,
      [sessionId],
    );
    return result.rows;
  }
}
