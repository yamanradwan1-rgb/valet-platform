import { expect } from "vitest";

import type { MarkReadyCommandOptions } from "../src/modules/retrieval/mark-ready-command";
import { createMarkReadyCommandExecutor } from "../src/modules/retrieval/mark-ready-command";
import {
  StartRetrievalTestContext,
  type StartRetrievalFixture,
} from "./start-retrieval-test-context";

export type MarkReadyFixture = StartRetrievalFixture;

export class MarkReadyTestContext extends StartRetrievalTestContext {
  constructor(label: string) {
    super(`006e_${label}`);
  }

  async createMarkReadyFixture(): Promise<MarkReadyFixture> {
    const fixture = await this.createStartRetrievalFixture();
    await this.startRetrieval(fixture);
    return fixture;
  }

  markReady(
    fixture: MarkReadyFixture,
    expectedSessionVersion = 6,
    options: MarkReadyCommandOptions = {},
  ) {
    return createMarkReadyCommandExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion,
      sessionId: fixture.sessionId,
    });
  }

  async readyEffects(fixture: MarkReadyFixture) {
    const projection = await this.adminPool.query<{
      current_assignee_membership_id: string | null;
      key_slot_id: string | null;
      parking_spot_id: string | null;
      parking_zone_id: string | null;
      ready_at: Date | null;
      request_status: string;
      retrieval_started_at: Date | null;
      session_state: string;
      session_version: number;
      task_assignee: string | null;
      task_status: string;
      task_version: number;
    }>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version, session.ready_at,
              session.retrieval_started_at, session.key_slot_id::text,
              session.parking_zone_id::text, session.parking_spot_id::text,
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
    const counts = await this.adminPool.query<{
      checked_out_count: number;
      in_progress_count: number;
      notification_count: number;
      ready_audit_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM key_custody_events
          WHERE valet_session_id = $1 AND event_type = 'CHECKED_OUT')
           AS checked_out_count,
         (SELECT count(*)::integer FROM dispatch_events
          WHERE task_id = $2 AND event_type = 'IN_PROGRESS')
           AS in_progress_count,
         (SELECT count(*)::integer FROM notifications
          WHERE valet_session_id = $1) AS notification_count,
         (SELECT count(*)::integer FROM audit_events
          WHERE valet_session_id = $1 AND event_type = 'VALET_SESSION_READY')
           AS ready_audit_count`,
      [fixture.sessionId, fixture.retrievalTaskId],
    );
    const audit = await this.adminPool.query<{
      actor_membership_id: string | null;
      occurred_at: Date;
    }>(
      `SELECT actor_membership_id::text, occurred_at FROM audit_events
       WHERE valet_session_id = $1 AND event_type = 'VALET_SESSION_READY'`,
      [fixture.sessionId],
    );
    return {
      audit: audit.rows,
      counts: counts.rows[0]!,
      projection: projection.rows[0]!,
    };
  }
}

export async function expectMarkReadyError(
  operation: Promise<unknown>,
  code: string,
) {
  await expect(operation).rejects.toMatchObject({ code });
}
