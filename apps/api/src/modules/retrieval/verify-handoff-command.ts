import type { HandoffStandardMethod } from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { appendHandoffAudit } from "./handoff-audit";
import { HandoffError } from "./handoff-errors";
import {
  assertHandoffLifecycle,
  authorizeHandoffOwner,
  lockHandoffRequest,
  lockHandoffSession,
  lockHandoffTask,
  lockUnconsumedVerification,
  resolveHandoffActor,
} from "./handoff-locks";
import {
  isHandoffMethodAllowed,
  loadEffectiveHandoffPolicy,
} from "./handoff-policy";
import { handoffMaterialMatches } from "./handoff-secret";
import type {
  LockedHandoffSession,
  LockedHandoffTask,
  LockedHandoffVerification,
} from "./handoff-types";

export interface VerifyHandoffRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly material: string;
  readonly method: HandoffStandardMethod;
  readonly sessionId: string;
}

type VerifyOutcome =
  | { readonly error: HandoffError; readonly kind: "ERROR" }
  | {
      readonly kind: "SUCCESS";
      readonly result: {
        readonly method: HandoffStandardMethod;
        readonly sessionId: string;
        readonly sessionVersion: number;
        readonly state: "HANDOFF_PENDING";
        readonly taskId: string;
        readonly taskStatus: "IN_PROGRESS";
        readonly taskVersion: number;
        readonly verificationStatus: "VERIFIED";
        readonly verifiedAt: string;
      };
    };

async function recordFailedAttempt(
  transaction: PostgresTransaction,
  antiAbuse: AntiAbuseService,
  session: LockedHandoffSession,
  task: LockedHandoffTask,
  actorMembershipId: string,
  method: HandoffStandardMethod,
  verification: LockedHandoffVerification | undefined,
  operationTime: Date,
  forceTerminalize: boolean,
): Promise<VerifyOutcome> {
  const key = antiAbuse.key("v1:handoff-verification-session", session.id);
  const decision = await antiAbuse.countInTransaction(transaction, key, 10);
  if (!decision.allowed) {
    return {
      error: new HandoffError(
        "HANDOFF_VERIFICATION_RATE_LIMITED",
        decision.retryAfter,
      ),
      kind: "ERROR",
    };
  }
  let attempt = 0;
  let terminalized = false;
  if (verification !== undefined && verification.verified_at === null) {
    attempt = Math.min(
      verification.attempt_count + 1,
      verification.max_attempts,
    );
    terminalized = forceTerminalize || attempt >= verification.max_attempts;
    await transaction.query(
      `UPDATE handoff_verifications
       SET attempt_count = $2, consumed_at = CASE WHEN $3 THEN $4 ELSE NULL END
       WHERE id = $1 AND consumed_at IS NULL`,
      [verification.id, attempt, terminalized, operationTime],
    );
  }
  await appendHandoffAudit(transaction, {
    actorMembershipId,
    eventType: "HANDOFF_VERIFICATION_FAILED",
    metadata: {
      attempt,
      max_attempts: verification?.max_attempts ?? 0,
      method,
      task_id: task.id,
      terminalized,
    },
    occurredAt: operationTime,
    session,
  });
  return {
    error: new HandoffError("HANDOFF_VERIFICATION_FAILED"),
    kind: "ERROR",
  };
}

export function createVerifyHandoffExecutor(
  pool: PostgresPool,
  antiAbuse: AntiAbuseService,
) {
  return async (input: VerifyHandoffRequest) => {
    const outcome = await inDispatchTransaction(pool, async (transaction) => {
      const session = await lockHandoffSession(transaction, input.sessionId);
      const actor = await resolveHandoffActor(
        transaction,
        session,
        input.authenticatedUserId,
      );
      const task = await lockHandoffTask(transaction, session);
      await authorizeHandoffOwner(transaction, session, task, actor);
      const request = await lockHandoffRequest(transaction, session);
      assertHandoffLifecycle(
        session,
        task,
        request,
        input.expectedSessionVersion,
        "HANDOFF_PENDING",
      );
      const rateKey = antiAbuse.key(
        "v1:handoff-verification-session",
        session.id,
      );
      const retryAfter = await antiAbuse.blockerInTransaction(
        transaction,
        rateKey,
        10,
      );
      if (retryAfter !== undefined) {
        return {
          error: new HandoffError(
            "HANDOFF_VERIFICATION_RATE_LIMITED",
            retryAfter,
          ),
          kind: "ERROR" as const,
        };
      }
      const policy = await loadEffectiveHandoffPolicy(
        transaction,
        session.organization_id,
        session.location_id,
      );
      const verification = await lockUnconsumedVerification(
        transaction,
        session,
      );
      if (verification?.verified_at !== null && verification !== undefined) {
        throw new HandoffError("HANDOFF_VERIFICATION_ALREADY_VERIFIED");
      }
      const operationTime = await loadDispatchOperationTime(transaction);
      const valid =
        verification !== undefined &&
        verification.method === input.method &&
        verification.secret_hash !== null &&
        verification.expires_at !== null &&
        verification.expires_at.getTime() > operationTime.getTime() &&
        verification.attempt_count < verification.max_attempts &&
        isHandoffMethodAllowed(policy, input.method) &&
        handoffMaterialMatches(
          verification.secret_hash,
          session.id,
          input.method,
          input.material,
        );
      if (!valid) {
        const forceTerminalize =
          verification !== undefined &&
          (verification.expires_at === null ||
            verification.expires_at.getTime() <= operationTime.getTime() ||
            (verification.method !== "SUPERVISOR_OVERRIDE" &&
              !isHandoffMethodAllowed(policy, verification.method)));
        return recordFailedAttempt(
          transaction,
          antiAbuse,
          session,
          task,
          actor.membershipId,
          input.method,
          verification,
          operationTime,
          forceTerminalize,
        );
      }
      await transaction.query(
        `UPDATE handoff_verifications
         SET verified_at = $2, verified_by_membership_id = $3
         WHERE id = $1 AND verified_at IS NULL AND consumed_at IS NULL`,
        [verification.id, operationTime, actor.membershipId],
      );
      const updated = await transaction.query<{ version: number }>(
        `UPDATE valet_sessions
         SET version = version + 1, updated_at = $3
         WHERE id = $1 AND version = $2 AND state = 'HANDOFF_PENDING'
         RETURNING version`,
        [session.id, session.version, operationTime],
      );
      const sessionVersion = updated.rows[0]?.version;
      if (sessionVersion === undefined)
        throw new HandoffError("VERSION_CONFLICT");
      await appendHandoffAudit(transaction, {
        actorMembershipId: actor.membershipId,
        eventType: "HANDOFF_VERIFIED",
        metadata: { method: input.method, task_id: task.id },
        occurredAt: operationTime,
        session,
      });
      return {
        kind: "SUCCESS" as const,
        result: {
          method: input.method,
          sessionId: session.id,
          sessionVersion,
          state: "HANDOFF_PENDING" as const,
          taskId: task.id,
          taskStatus: "IN_PROGRESS" as const,
          taskVersion: task.version,
          verificationStatus: "VERIFIED" as const,
          verifiedAt: operationTime.toISOString(),
        },
      };
    });
    if (outcome.kind === "ERROR") throw outcome.error;
    return outcome.result;
  };
}
