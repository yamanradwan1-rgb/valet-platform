import { randomBytes } from "node:crypto";

import type { HandoffStandardMethod } from "@valet/contracts";

import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { createAbortHandoffExecutor } from "../src/modules/retrieval/abort-handoff-command";
import { HandoffService } from "../src/modules/retrieval/handoff.service";
import { createInitiateHandoffExecutor } from "../src/modules/retrieval/initiate-handoff-command";
import { createOverrideHandoffExecutor } from "../src/modules/retrieval/override-handoff-command";
import { createVerifyHandoffExecutor } from "../src/modules/retrieval/verify-handoff-command";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import {
  MarkReadyTestContext,
  type MarkReadyFixture,
} from "./mark-ready-test-context";

export interface HandoffFixture extends MarkReadyFixture {
  readonly guestToken: string;
}

export class HandoffTestContext extends MarkReadyTestContext {
  private priorAntiAbuseSecret: string | undefined;
  private priorHandoffSecret: string | undefined;

  constructor(label: string) {
    super(`006f_${label}`);
  }

  override async setup(): Promise<void> {
    this.priorAntiAbuseSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    this.priorHandoffSecret = process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    await super.setup();
  }

  override async teardown(): Promise<void> {
    try {
      await super.teardown();
    } finally {
      if (this.priorAntiAbuseSecret === undefined) {
        delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
      } else {
        process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = this.priorAntiAbuseSecret;
      }
      if (this.priorHandoffSecret === undefined) {
        delete process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL;
      } else {
        process.env.HANDOFF_VERIFIER_HMAC_SECRET_B64URL =
          this.priorHandoffSecret;
      }
    }
  }

  antiAbuse(): AntiAbuseService {
    return new AntiAbuseService(this.runtimePool, new AntiAbuseKeyDeriver());
  }

  async createHandoffFixture(): Promise<HandoffFixture> {
    const fixture = await this.createMarkReadyFixture();
    await this.markReady(fixture);
    const guestToken = randomBytes(32).toString("base64url");
    await this.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash = $2,
           customer_access_expires_at = transaction_timestamp() + interval '1 hour',
           customer_access_revoked_at = NULL
       WHERE id = $1`,
      [fixture.sessionId, hashGuestAccessToken(guestToken)],
    );
    return { ...fixture, guestToken };
  }

  async addCrossTenantSupervisor() {
    const actor = await this.createFixture({ role: "VALET_SUPERVISOR" });
    await this.startShift(actor);
    return actor;
  }

  async addWrongLocationSupervisor(fixture: HandoffFixture) {
    const actor = await this.addMember(fixture, "VALET_SUPERVISOR", false);
    await this.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id = $1 AND location_id = $2`,
      [actor.membershipId, fixture.locationId],
    );
    const wrongLocationId = await this.addLocation(fixture);
    await this.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, actor.membershipId, wrongLocationId],
    );
    await this.startShift({
      locationId: wrongLocationId,
      membershipId: actor.membershipId,
      organizationId: fixture.organizationId,
      userId: actor.userId,
    });
    return actor;
  }

  initiate(fixture: HandoffFixture, expectedSessionVersion = 7) {
    return createInitiateHandoffExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion,
      sessionId: fixture.sessionId,
    });
  }

  async issue(
    fixture: HandoffFixture,
    method: HandoffStandardMethod,
    rotate = false,
  ) {
    const antiAbuse = this.antiAbuse();
    const reservation = await antiAbuse.reserve(
      antiAbuse.key("v1:guest-client-address", `test-${fixture.sessionId}`),
      60,
    );
    if (!reservation.allowed) throw new Error("Test reservation was limited.");
    const service = new HandoffService(
      this.runtimePool,
      antiAbuse,
      new GuestAccessService(this.runtimePool),
    );
    return service.issueGuestMaterial(
      reservation.reservation,
      fixture.guestToken,
      method,
      rotate,
    );
  }

  verify(
    fixture: HandoffFixture,
    method: HandoffStandardMethod,
    material: string,
    expectedSessionVersion = 8,
  ) {
    return createVerifyHandoffExecutor(
      this.runtimePool,
      this.antiAbuse(),
    )({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion,
      material,
      method,
      sessionId: fixture.sessionId,
    });
  }

  overrideHandoff(
    fixture: HandoffFixture,
    authenticatedUserId: string,
    expectedSessionVersion: number,
    reason = "Guest identity confirmed by supervisor",
  ) {
    return createOverrideHandoffExecutor(this.runtimePool)({
      authenticatedUserId,
      expectedSessionVersion,
      reason,
      sessionId: fixture.sessionId,
    });
  }

  abort(
    fixture: HandoffFixture,
    authenticatedUserId = fixture.userId,
    expectedSessionVersion = 8,
    reason = "Guest temporarily left the pickup point",
  ) {
    return createAbortHandoffExecutor(this.runtimePool)({
      authenticatedUserId,
      expectedSessionVersion,
      reason,
      sessionId: fixture.sessionId,
    });
  }

  async handoffEffects(fixture: HandoffFixture) {
    const projection = await this.adminPool.query<{
      handoff_pending_at: Date | null;
      ready_at: Date | null;
      request_status: string;
      session_state: string;
      session_version: number;
      task_status: string;
      task_version: number;
    }>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version, session.ready_at,
              session.handoff_pending_at, task.status::text AS task_status,
              task.version AS task_version, request.status::text AS request_status
       FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.id = $2
       INNER JOIN retrieval_requests AS request ON request.id = $3
       WHERE session.id = $1`,
      [fixture.sessionId, fixture.retrievalTaskId, fixture.retrievalRequestId],
    );
    const verifications = await this.adminPool.query<{
      attempt_count: number;
      consumed_at: Date | null;
      expires_at: Date | null;
      max_attempts: number;
      method: string;
      override_reason: string | null;
      secret_hash: string | null;
      verified_at: Date | null;
    }>(
      `SELECT method::text, secret_hash, expires_at, attempt_count,
              max_attempts, verified_at, consumed_at, override_reason
       FROM handoff_verifications WHERE valet_session_id = $1
       ORDER BY created_at, id`,
      [fixture.sessionId],
    );
    const audits = await this.adminPool.query<{
      actor_membership_id: string | null;
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT actor_membership_id::text, event_type, metadata_json
       FROM audit_events WHERE valet_session_id = $1
         AND event_type LIKE '%HANDOFF%'
       ORDER BY occurred_at, id`,
      [fixture.sessionId],
    );
    return {
      audits: audits.rows,
      projection: projection.rows[0]!,
      verifications: verifications.rows,
    };
  }
}
