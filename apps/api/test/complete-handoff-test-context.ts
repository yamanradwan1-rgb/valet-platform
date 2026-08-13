import type { HandoffStandardMethod } from "@valet/contracts";

import { createCompleteHandoffExecutor } from "../src/modules/retrieval/complete-handoff-command";
import type { CompleteHandoffCommandOptions } from "../src/modules/retrieval/complete-handoff-command";
import {
  HandoffTestContext,
  type HandoffFixture,
} from "./handoff-test-context";

export class CompleteHandoffTestContext extends HandoffTestContext {
  constructor(label: string) {
    super(`006g_${label}`);
  }

  complete(
    fixture: HandoffFixture,
    authenticatedUserId = fixture.userId,
    expectedSessionVersion = 9,
    options: CompleteHandoffCommandOptions = {},
  ) {
    return createCompleteHandoffExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId,
      expectedSessionVersion,
      sessionId: fixture.sessionId,
    });
  }

  async prepareStandard(method: HandoffStandardMethod) {
    const fixture = await this.createHandoffFixture();
    await this.initiate(fixture);
    const material = await this.issue(fixture, method);
    await this.verify(
      fixture,
      method,
      material.method === "PICKUP_CODE"
        ? material.pickupCode
        : material.qrPayload,
    );
    return fixture;
  }

  async prepareOverride() {
    const fixture = await this.createHandoffFixture();
    await this.initiate(fixture);
    const supervisor = await this.addMember(fixture, "VALET_SUPERVISOR");
    await this.overrideHandoff(fixture, supervisor.userId, 8);
    return { fixture, supervisor };
  }

  async setHandoffPolicy(
    fixture: HandoffFixture,
    policy: "PICKUP_CODE" | "DYNAMIC_QR" | "EITHER",
  ) {
    await this.adminPool.query(
      `UPDATE locations
       SET handoff_standard_method_policy_override = $2
       WHERE id = $1`,
      [fixture.locationId, policy],
    );
  }

  async releaseEffects(fixture: HandoffFixture) {
    const projection = await this.adminPool.query<{
      completed_at: Date | null;
      completed_by_membership_id: string | null;
      handoff_pending_at: Date | null;
      key_slot_id: string | null;
      ready_at: Date | null;
      request_status: string;
      retrieval_requested_at: Date | null;
      retrieval_started_at: Date | null;
      session_state: string;
      session_version: number;
      task_assignee: string | null;
      task_status: string;
      task_version: number;
    }>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version, session.key_slot_id::text,
              session.completed_at, session.completed_by_membership_id::text,
              session.ready_at, session.handoff_pending_at,
              session.retrieval_requested_at, session.retrieval_started_at,
              task.status::text AS task_status,
              task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee,
              request.status::text AS request_status
       FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.id = $2
       INNER JOIN retrieval_requests AS request ON request.id = $3
       WHERE session.id = $1`,
      [fixture.sessionId, fixture.retrievalTaskId, fixture.retrievalRequestId],
    );
    const verifications = await this.adminPool.query<{
      consumed_at: Date | null;
      method: string;
      verified_at: Date | null;
    }>(
      `SELECT method::text, verified_at, consumed_at
       FROM handoff_verifications WHERE valet_session_id = $1
       ORDER BY created_at, id`,
      [fixture.sessionId],
    );
    const custody = await this.adminPool.query<{
      actor_membership_id: string;
      event_type: string;
      key_slot_id: string | null;
      occurred_at: Date;
    }>(
      `SELECT event_type::text, key_slot_id::text,
              actor_membership_id::text, occurred_at
       FROM key_custody_events WHERE valet_session_id = $1
       ORDER BY occurred_at, id`,
      [fixture.sessionId],
    );
    const dispatch = await this.adminPool.query<{
      actor_membership_id: string | null;
      event_type: string;
      new_assignee_membership_id: string | null;
      occurred_at: Date;
    }>(
      `SELECT event_type::text, actor_membership_id::text,
              new_assignee_membership_id::text, occurred_at
       FROM dispatch_events WHERE task_id = $1
       ORDER BY occurred_at, id`,
      [fixture.retrievalTaskId],
    );
    const audits = await this.adminPool.query<{
      actor_membership_id: string | null;
      event_type: string;
      metadata_json: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `SELECT event_type, actor_membership_id::text, metadata_json, occurred_at
       FROM audit_events WHERE valet_session_id = $1
         AND event_type IN
           ('VALET_SESSION_VEHICLE_RELEASED', 'VALET_SESSION_COMPLETED')
       ORDER BY occurred_at, id`,
      [fixture.sessionId],
    );
    return {
      audits: audits.rows,
      custody: custody.rows,
      dispatch: dispatch.rows,
      projection: projection.rows[0]!,
      verifications: verifications.rows,
    };
  }
}
