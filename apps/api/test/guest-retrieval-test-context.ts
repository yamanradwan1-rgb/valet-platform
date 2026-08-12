import { randomBytes } from "node:crypto";

import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import {
  ConfirmParkedTestContext,
  type ConfirmParkedFixture,
} from "./confirm-parked-test-context";

export interface GuestRetrievalFixture extends ConfirmParkedFixture {
  readonly rawToken: string;
}

export class GuestRetrievalTestContext extends ConfirmParkedTestContext {
  constructor(label: string) {
    super(`006b_${label}`);
  }

  async enableGuest(
    fixture: ConfirmParkedFixture,
  ): Promise<GuestRetrievalFixture> {
    const rawToken = randomBytes(32).toString("base64url");
    await this.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash = $2,
           customer_access_expires_at = transaction_timestamp() + interval '1 hour',
           customer_access_revoked_at = NULL,
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.sessionId, hashGuestAccessToken(rawToken)],
    );
    return { ...fixture, rawToken };
  }

  async createParkedGuestFixture(): Promise<GuestRetrievalFixture> {
    const fixture = await this.createConfirmParkedFixture();
    await this.confirm(fixture);
    return this.enableGuest(fixture);
  }

  async createParkingGuestFixture(): Promise<GuestRetrievalFixture> {
    const fixture = await this.createConfirmParkedFixture();
    return this.enableGuest(fixture);
  }

  async snapshot(sessionId: string) {
    const session = await this.adminPool.query<{
      customer_id: string | null;
      retrieval_requested_at: Date | null;
      state: string;
      version: number;
    }>(
      `SELECT state::text, version, retrieval_requested_at,
              customer_id::text
       FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    const requests = await this.adminPool.query<{
      requested_by_customer_id: string | null;
      requested_by_membership_id: string | null;
      status: string;
    }>(
      `SELECT status::text, requested_by_customer_id::text,
              requested_by_membership_id::text
       FROM retrieval_requests WHERE valet_session_id = $1
       ORDER BY requested_at, id`,
      [sessionId],
    );
    const tasks = await this.adminPool.query<{
      current_assignee_membership_id: string | null;
      id: string;
      status: string;
      task_type: string;
      version: number;
    }>(
      `SELECT id::text, task_type::text, status::text,
              current_assignee_membership_id::text, version
       FROM tasks
       WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL'
       ORDER BY created_at, id`,
      [sessionId],
    );
    const dispatch = await this.adminPool.query<{
      actor_membership_id: string | null;
      event_type: string;
    }>(
      `SELECT event_type::text, actor_membership_id::text
       FROM dispatch_events WHERE valet_session_id = $1
       ORDER BY occurred_at, id`,
      [sessionId],
    );
    const audit = await this.adminPool.query<{
      actor_membership_id: string | null;
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT event_type, actor_membership_id::text, metadata_json
       FROM audit_events
       WHERE valet_session_id = $1 AND event_type = 'RETRIEVAL_REQUESTED'
       ORDER BY occurred_at, id`,
      [sessionId],
    );
    return {
      audit: audit.rows,
      dispatch: dispatch.rows.filter((event) => event.event_type === "QUEUED"),
      requests: requests.rows,
      session: session.rows[0]!,
      tasks: tasks.rows,
    };
  }
}
