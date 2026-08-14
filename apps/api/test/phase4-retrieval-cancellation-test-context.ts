import type { HttpResult } from "./phase3-operations-gate-test-context";
import {
  Phase4RetrievalHandoffGateContext,
  type RequestedGateFixture,
} from "./phase4-retrieval-handoff-gate-test-context";

function number(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number") throw new Error(`Missing number ${key}.`);
  return value;
}

export class Phase4RetrievalCancellationTestContext extends Phase4RetrievalHandoffGateContext {
  constructor(label: string) {
    super(`cancel_${label}`);
  }

  cancel(fixture: RequestedGateFixture): Promise<HttpResult> {
    return this.guestPost(
      fixture.guestToken,
      "/v1/guest/session/cancel-retrieval",
    );
  }

  async assign(
    fixture: RequestedGateFixture,
    accept: boolean,
  ): Promise<RequestedGateFixture> {
    const assigned = await this.staffPost(
      fixture.accessToken,
      `/v1/staff/tasks/${fixture.taskId}/assign`,
      { expectedVersion: fixture.taskVersion },
    );
    if (!accept) {
      return { ...fixture, taskVersion: number(assigned.body, "version") };
    }
    const accepted = await this.staffPost(
      fixture.accessToken,
      `/v1/staff/tasks/${fixture.taskId}/accept`,
      { expectedVersion: number(assigned.body, "version") },
    );
    return { ...fixture, taskVersion: number(accepted.body, "version") };
  }

  async cancellationEffects(fixture: RequestedGateFixture) {
    const projection = await this.adminPool.query<Record<string, unknown>>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version,
              session.retrieval_requested_at, session.key_slot_id::text,
              session.parking_zone_id::text, session.parking_spot_id::text,
              session.retrieval_started_at, session.ready_at,
              session.handoff_pending_at,
              request.status::text AS request_status, request.cancelled_at,
              task.status::text AS task_status, task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee,
              task.updated_at AS task_updated_at,
              (SELECT count(*)::integer FROM handoff_verifications
               WHERE valet_session_id = session.id) AS verification_count
       FROM valet_sessions AS session
       INNER JOIN retrieval_requests AS request ON request.id = $2
       INNER JOIN tasks AS task ON task.id = $3
       WHERE session.id = $1`,
      [fixture.sessionId, fixture.requestId, fixture.taskId],
    );
    const dispatch = await this.adminPool.query<Record<string, unknown>>(
      `SELECT event_type::text, actor_membership_id::text,
              previous_assignee_membership_id::text,
              new_assignee_membership_id::text, reason
       FROM dispatch_events WHERE task_id = $1
       ORDER BY occurred_at, created_at, id`,
      [fixture.taskId],
    );
    const audits = await this.adminPool.query<Record<string, unknown>>(
      `SELECT event_type, actor_membership_id::text, metadata_json
       FROM audit_events
       WHERE valet_session_id = $1 AND event_type = 'RETRIEVAL_CANCELLED'
       ORDER BY occurred_at, created_at, id`,
      [fixture.sessionId],
    );
    return {
      audits: audits.rows,
      custody: await this.eventTypes("key_custody_events", fixture.sessionId),
      dispatch: dispatch.rows,
      projection: projection.rows[0]!,
    };
  }

  async lifecycleRows(sessionId: string) {
    const requests = await this.adminPool.query<Record<string, unknown>>(
      `SELECT id::text, status::text, requested_at, cancelled_at
       FROM retrieval_requests WHERE valet_session_id = $1
       ORDER BY requested_at, id`,
      [sessionId],
    );
    const tasks = await this.adminPool.query<Record<string, unknown>>(
      `SELECT id::text, status::text, version, created_at,
              current_assignee_membership_id::text AS assignee
       FROM tasks WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL'
       ORDER BY created_at, id`,
      [sessionId],
    );
    return { requests: requests.rows, tasks: tasks.rows };
  }
}
