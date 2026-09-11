import { createHash, randomBytes, randomUUID } from "node:crypto";

import { inDispatchTransaction } from "../src/modules/dispatch/dispatch-transaction";
import { requestGuestRetrieval } from "../src/modules/retrieval/guest-retrieval-request-command";
import type { StaffPushIntentCreationPolicy } from "../src/modules/staff-push/staff-push-operational-policy";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { resolveAndLockGuestAccessSession } from "../src/modules/valet-sessions/guest-access-session-resolution";
import {
  ConfirmParkedTestContext,
  type ConfirmParkedFixture,
} from "./confirm-parked-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

export interface GuestParkedFixture extends ConfirmParkedFixture {
  readonly rawGuestToken: string;
}

export interface PushRegistrationFixture {
  readonly registrationId: string;
  readonly sessionId: string;
}

export interface RetrievalPushEffects {
  readonly audit_count: number;
  readonly delivery_count: number;
  readonly dispatch_count: number;
  readonly intent_count: number;
  readonly request_count: number;
  readonly session_state: string;
  readonly task_count: number;
}

export class RetrievalPushTestContext extends ConfirmParkedTestContext {
  constructor(label: string) {
    super(`020c_${label}`);
  }

  async createGuestParkedFixture(): Promise<GuestParkedFixture> {
    const fixture = await this.createConfirmParkedFixture();
    await this.confirm(fixture);
    const rawGuestToken = randomBytes(32).toString("base64url");
    await this.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash = $2,
           customer_access_expires_at = transaction_timestamp() + interval '1 hour',
           customer_access_revoked_at = NULL
       WHERE id = $1`,
      [fixture.sessionId, hashGuestAccessToken(rawGuestToken)],
    );
    return { ...fixture, rawGuestToken };
  }

  request(
    fixture: GuestParkedFixture,
    policy: StaffPushIntentCreationPolicy = syntheticStaffPushPolicy.employeeRetrievalRequested,
    creationEnabled = true,
  ) {
    return inDispatchTransaction(this.runtimePool, async (transaction) =>
      requestGuestRetrieval(
        transaction,
        await resolveAndLockGuestAccessSession(
          transaction,
          fixture.rawGuestToken,
        ),
        policy,
        creationEnabled,
      ),
    );
  }

  async addRegistration(
    userId: string,
    options: {
      readonly absoluteExpired?: boolean;
      readonly revoked?: boolean;
      readonly state?:
        "ACTIVE" | "DISABLED" | "PROVIDER_INVALID" | "SUPERSEDED";
    } = {},
  ): Promise<PushRegistrationFixture> {
    const sessionId = randomUUID();
    const registrationId = randomUUID();
    const state = options.state ?? "ACTIVE";
    const accessHash = `staff-access-sha256:v1:${createHash("sha256")
      .update(sessionId)
      .digest("hex")}`;
    await this.adminPool.query(
      `INSERT INTO staff_auth_sessions
         (id, user_id, current_access_token_hash, access_expires_at,
          absolute_expires_at, revoked_at, created_at, last_rotated_at)
       VALUES ($1, $2, $3,
               transaction_timestamp() + CASE WHEN $4 THEN interval '-1 hour' ELSE interval '1 hour' END,
               transaction_timestamp() + CASE WHEN $4 THEN interval '-1 minute' ELSE interval '1 day' END,
               CASE WHEN $5 THEN transaction_timestamp() ELSE NULL END,
               transaction_timestamp() + CASE WHEN $4 THEN interval '-2 hours' ELSE interval '0' END,
               transaction_timestamp() + CASE WHEN $4 THEN interval '-2 hours' ELSE interval '0' END)`,
      [
        sessionId,
        userId,
        accessHash,
        options.absoluteExpired ?? false,
        options.revoked ?? false,
      ],
    );
    await this.insertActiveRegistration(registrationId, sessionId);
    if (state !== "ACTIVE") {
      let successorId: string | null = null;
      if (state === "SUPERSEDED") {
        successorId = randomUUID();
        await this.insertActiveRegistration(successorId, sessionId);
        await this.terminalizeRegistration(successorId, "DISABLED", null);
      }
      await this.terminalizeRegistration(registrationId, state, successorId);
    }
    return { registrationId, sessionId };
  }

  async retrievalEffects(sessionId: string): Promise<RetrievalPushEffects> {
    const result = await this.adminPool.query<RetrievalPushEffects>(
      `SELECT session.state::text AS session_state,
        (SELECT count(*)::integer FROM retrieval_requests WHERE valet_session_id = $1) AS request_count,
        (SELECT count(*)::integer FROM tasks WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL') AS task_count,
        (SELECT count(*)::integer FROM dispatch_events WHERE valet_session_id = $1 AND event_type = 'QUEUED'
          AND task_id IN (SELECT id FROM tasks WHERE valet_session_id = $1 AND task_type = 'RETRIEVAL')) AS dispatch_count,
        (SELECT count(*)::integer FROM audit_events WHERE valet_session_id = $1 AND event_type = 'RETRIEVAL_REQUESTED') AS audit_count,
        (SELECT count(*)::integer FROM staff_push_intents WHERE valet_session_id = $1) AS intent_count,
        (SELECT count(*)::integer FROM staff_push_deliveries AS delivery
          INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
          WHERE intent.valet_session_id = $1) AS delivery_count
       FROM valet_sessions AS session WHERE session.id = $1`,
      [sessionId],
    );
    return result.rows[0]!;
  }

  async deliveryRegistrationIds(sessionId: string): Promise<string[]> {
    const result = await this.adminPool.query<{ registration_id: string }>(
      `SELECT delivery.registration_id::text
       FROM staff_push_deliveries AS delivery
       INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
       WHERE intent.valet_session_id = $1 ORDER BY delivery.registration_id`,
      [sessionId],
    );
    return result.rows.map((row) => row.registration_id);
  }

  async installFailureTrigger(
    table: "staff_push_deliveries" | "staff_push_intents",
  ) {
    const name = `mob020c_fail_${table}`;
    await this.adminPool.query(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS
       'BEGIN RAISE EXCEPTION ''synthetic MOB-020C persistence failure''; END'`,
    );
    await this.adminPool.query(
      `CREATE TRIGGER ${name} BEFORE INSERT ON ${table}
       FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    return async () => {
      await this.adminPool.query(`DROP TRIGGER ${name} ON ${table}`);
      await this.adminPool.query(`DROP FUNCTION ${name}()`);
    };
  }

  private async insertActiveRegistration(id: string, sessionId: string) {
    const installationId = randomUUID();
    const tokenHash = `staff-push-token-sha256:v1:${createHash("sha256")
      .update(id)
      .digest("hex")}`;
    await this.adminPool.query(
      `INSERT INTO staff_push_registrations
         (id, staff_auth_session_id, provider, platform, app_identifier,
          installation_id, provider_token, token_hash, app_version, app_build,
          locale, created_at, updated_at, last_confirmed_at)
       VALUES ($1, $2, 'FCM', 'ANDROID', 'com.vaylet.employee', $3,
               $4, $5, 'synthetic', 'synthetic', 'en',
               transaction_timestamp(), transaction_timestamp(), transaction_timestamp())`,
      [id, sessionId, installationId, `synthetic-token-${id}`, tokenHash],
    );
  }

  private async terminalizeRegistration(
    id: string,
    state: "DISABLED" | "PROVIDER_INVALID" | "SUPERSEDED",
    successorId: string | null,
  ) {
    await this.adminPool.query(
      `UPDATE staff_push_registrations
       SET state = $2, provider_token = NULL, terminal_at = transaction_timestamp(),
           terminal_reason_class = 'SYNTHETIC_TEST',
           superseded_by_registration_id = $3, updated_at = transaction_timestamp()
       WHERE id = $1`,
      [id, state, successorId],
    );
  }
}
