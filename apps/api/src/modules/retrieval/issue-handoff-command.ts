import { randomUUID } from "node:crypto";

import type { HandoffStandardMethod } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";
import { loadDispatchOperationTime } from "../dispatch/dispatch-transaction";
import type { LockedGuestAccessSessionScope } from "../valet-sessions/guest-access-session-resolution";
import { appendHandoffAudit } from "./handoff-audit";
import { HandoffError } from "./handoff-errors";
import {
  lockHandoffRequest,
  lockHandoffTask,
  lockUnconsumedVerification,
} from "./handoff-locks";
import {
  assertHandoffMethodAllowed,
  loadEffectiveHandoffPolicy,
} from "./handoff-policy";
import {
  deriveHandoffVerifier,
  generateHandoffMaterial,
} from "./handoff-secret";
import type { GuestHandoffMaterial, HandoffScope } from "./handoff-types";

export async function issueHandoffVerification(
  transaction: PostgresTransaction,
  antiAbuse: AntiAbuseService,
  guestSession: LockedGuestAccessSessionScope,
  method: HandoffStandardMethod,
  rotate: boolean,
): Promise<GuestHandoffMaterial> {
  if (guestSession.state !== "HANDOFF_PENDING") {
    throw new HandoffError("INVALID_STATE_TRANSITION");
  }
  const session: HandoffScope = {
    id: guestSession.valetSessionId,
    location_id: guestSession.locationId,
    organization_id: guestSession.organizationId,
  };
  const task = await lockHandoffTask(transaction, session);
  const request = await lockHandoffRequest(transaction, session);
  if (task.status !== "IN_PROGRESS")
    throw new HandoffError("TASK_INVALID_STATE");
  if (request.status !== "ACCEPTED")
    throw new HandoffError("RETRIEVAL_REQUEST_NOT_READY");
  const policy = await loadEffectiveHandoffPolicy(
    transaction,
    session.organization_id,
    session.location_id,
  );
  assertHandoffMethodAllowed(policy, method);
  const active = await lockUnconsumedVerification(transaction, session);
  if (!rotate && active !== undefined) {
    throw new HandoffError("HANDOFF_VERIFICATION_ALREADY_ISSUED");
  }
  if (rotate && active?.verified_at !== null && active !== undefined) {
    throw new HandoffError("HANDOFF_VERIFICATION_ALREADY_VERIFIED");
  }
  const material = generateHandoffMaterial(method);
  const verifier = deriveHandoffVerifier(session.id, method, material);
  const issuanceKey = antiAbuse.key("v1:handoff-issuance-session", session.id);
  const decision = await antiAbuse.countInTransaction(
    transaction,
    issuanceKey,
    5,
  );
  if (!decision.allowed) {
    throw new HandoffError(
      "HANDOFF_VERIFICATION_RATE_LIMITED",
      decision.retryAfter,
    );
  }
  const operationTime = await loadDispatchOperationTime(transaction);
  if (rotate && active !== undefined) {
    await transaction.query(
      `UPDATE handoff_verifications SET consumed_at = $2
       WHERE id = $1 AND consumed_at IS NULL`,
      [active.id, operationTime],
    );
  }
  const expiresAt = new Date(
    operationTime.getTime() + (method === "PICKUP_CODE" ? 600_000 : 120_000),
  );
  await transaction.query(
    `INSERT INTO handoff_verifications
       (id, organization_id, valet_session_id, method, secret_hash,
        expires_at, attempt_count, max_attempts, created_at)
     VALUES ($1, $2, $3, $4::handoff_verification_method, $5, $6, 0, 5, $7)`,
    [
      randomUUID(),
      session.organization_id,
      session.id,
      method,
      verifier,
      expiresAt,
      operationTime,
    ],
  );
  await appendHandoffAudit(transaction, {
    actorMembershipId: null,
    actorType: "GUEST",
    eventType: rotate
      ? "HANDOFF_VERIFICATION_ROTATED"
      : "HANDOFF_VERIFICATION_ISSUED",
    metadata: { method, rotated: rotate },
    occurredAt: operationTime,
    session,
  });
  const base = {
    expiresAt: expiresAt.toISOString(),
    state: "HANDOFF_PENDING" as const,
    valetSessionId: session.id,
  };
  return method === "PICKUP_CODE"
    ? { ...base, method, pickupCode: material }
    : { ...base, method, qrPayload: material };
}
