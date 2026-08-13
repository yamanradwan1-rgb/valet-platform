import { expect } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import type { StartRetrievalCommandOptions } from "../src/modules/retrieval/start-retrieval-command";
import { createStartRetrievalCommandExecutor } from "../src/modules/retrieval/start-retrieval-command";
import {
  ConfirmParkedTestContext,
  type ConfirmParkedFixture,
} from "./confirm-parked-test-context";

export interface StartRetrievalFixture extends ConfirmParkedFixture {
  readonly retrievalRequestId: string;
  readonly retrievalTaskId: string;
}

export class StartRetrievalTestContext extends ConfirmParkedTestContext {
  constructor(label: string) {
    super(`006d_${label}`);
  }

  async createStartRetrievalFixture(): Promise<StartRetrievalFixture> {
    const parked = await this.createConfirmParkedFixture();
    await this.confirm(parked);
    await this.adminPool.query(
      `UPDATE valet_sessions
       SET state = 'REQUESTED', retrieval_requested_at = transaction_timestamp(),
           version = version + 1, updated_at = transaction_timestamp()
       WHERE id = $1`,
      [parked.sessionId],
    );
    const retrieval = await this.createRetrievalTask(parked);
    const assigned = await createAssignTaskCommandExecutor(this.runtimePool)({
      authenticatedUserId: parked.userId,
      expectedVersion: 1,
      taskId: retrieval.taskId,
    });
    await createAcceptTaskCommandExecutor(this.runtimePool)({
      authenticatedUserId: parked.userId,
      expectedVersion: assigned.version,
      taskId: retrieval.taskId,
    });
    return {
      ...parked,
      retrievalRequestId: retrieval.retrievalRequestId,
      retrievalTaskId: retrieval.taskId,
    };
  }

  startRetrieval(
    fixture: StartRetrievalFixture,
    versions: { readonly session?: number; readonly task?: number } = {},
    options: StartRetrievalCommandOptions = {},
  ) {
    return createStartRetrievalCommandExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: versions.session ?? 5,
      expectedTaskVersion: versions.task ?? 3,
      sessionId: fixture.sessionId,
    });
  }

  async retrievalEffects(fixture: StartRetrievalFixture) {
    const projection = await this.adminPool.query<{
      current_assignee_membership_id: string | null;
      key_slot_id: string | null;
      parking_spot_id: string | null;
      parking_zone_id: string | null;
      request_status: string;
      retrieval_started_at: Date | null;
      session_state: string;
      session_version: number;
      task_assignee: string | null;
      task_status: string;
      task_version: number;
    }>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version, session.retrieval_started_at,
              session.key_slot_id::text, session.parking_zone_id::text,
              session.parking_spot_id::text,
              session.current_assignee_membership_id::text,
              task.status::text AS task_status, task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee,
              request.status::text AS request_status
       FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.id = $2
       INNER JOIN retrieval_requests AS request ON request.id = $3
       WHERE session.id = $1`,
      [fixture.sessionId, fixture.retrievalTaskId, fixture.retrievalRequestId],
    );
    const history = await this.adminPool.query<{
      actor_membership_id: string | null;
      event_type: string;
      key_slot_id: string | null;
      occurred_at: Date;
    }>(
      `SELECT actor_membership_id::text, event_type::text,
              key_slot_id::text, occurred_at
       FROM key_custody_events
       WHERE valet_session_id = $1 AND event_type = 'CHECKED_OUT'
       UNION ALL
       SELECT actor_membership_id::text, event_type::text, NULL, occurred_at
       FROM dispatch_events
       WHERE task_id = $2 AND event_type = 'IN_PROGRESS'
       UNION ALL
       SELECT actor_membership_id::text, event_type, NULL, occurred_at
       FROM audit_events
       WHERE valet_session_id = $1
         AND event_type = 'VALET_SESSION_RETRIEVAL_STARTED'`,
      [fixture.sessionId, fixture.retrievalTaskId],
    );
    const counts = await this.adminPool.query<{
      request_count: number;
      task_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM retrieval_requests
          WHERE valet_session_id = $1) AS request_count,
         (SELECT count(*)::integer FROM tasks
          WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL') AS task_count`,
      [fixture.sessionId],
    );
    return {
      counts: counts.rows[0]!,
      history: history.rows,
      projection: projection.rows[0]!,
    };
  }
}

export async function expectStartRetrievalError(
  operation: Promise<unknown>,
  code: string,
) {
  await expect(operation).rejects.toMatchObject({ code });
}
