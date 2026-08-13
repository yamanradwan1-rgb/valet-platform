import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { appendHandoffAudit } from "./handoff-audit";
import { HandoffError } from "./handoff-errors";
import {
  assertHandoffLifecycle,
  authorizeHandoffSupervisor,
  lockHandoffRequest,
  lockHandoffSession,
  lockHandoffTask,
  lockUnconsumedVerification,
  resolveHandoffActor,
} from "./handoff-locks";

export interface OverrideHandoffRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly reason: string;
  readonly sessionId: string;
}

export function createOverrideHandoffExecutor(pool: PostgresPool) {
  return (input: OverrideHandoffRequest) =>
    inDispatchTransaction(pool, async (transaction) => {
      const session = await lockHandoffSession(transaction, input.sessionId);
      const actor = await resolveHandoffActor(
        transaction,
        session,
        input.authenticatedUserId,
      );
      await authorizeHandoffSupervisor(transaction, session, actor);
      const task = await lockHandoffTask(transaction, session);
      const request = await lockHandoffRequest(transaction, session);
      assertHandoffLifecycle(
        session,
        task,
        request,
        input.expectedSessionVersion,
        "HANDOFF_PENDING",
      );
      const reason = input.reason.trim();
      if (reason.length === 0 || reason.length > 500) {
        throw new HandoffError("HANDOFF_OVERRIDE_REASON_REQUIRED");
      }
      const active = await lockUnconsumedVerification(transaction, session);
      if (active?.verified_at !== null && active !== undefined) {
        throw new HandoffError("HANDOFF_VERIFICATION_ALREADY_VERIFIED");
      }
      const operationTime = await loadDispatchOperationTime(transaction);
      if (active !== undefined) {
        await transaction.query(
          `UPDATE handoff_verifications SET consumed_at = $2
           WHERE id = $1 AND consumed_at IS NULL`,
          [active.id, operationTime],
        );
      }
      await transaction.query(
        `INSERT INTO handoff_verifications
           (id, organization_id, valet_session_id, method, attempt_count,
            max_attempts, verified_at, verified_by_membership_id,
            override_reason, created_at)
         VALUES ($1, $2, $3, 'SUPERVISOR_OVERRIDE', 0, 0, $4, $5, $6, $4)`,
        [
          randomUUID(),
          session.organization_id,
          session.id,
          operationTime,
          actor.membershipId,
          reason,
        ],
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
        eventType: "HANDOFF_SUPERVISOR_OVERRIDE",
        metadata: { reason, task_id: task.id },
        occurredAt: operationTime,
        session,
      });
      return {
        method: "SUPERVISOR_OVERRIDE" as const,
        sessionId: session.id,
        sessionVersion,
        state: "HANDOFF_PENDING" as const,
        taskId: task.id,
        taskStatus: "IN_PROGRESS" as const,
        taskVersion: task.version,
        verificationStatus: "VERIFIED" as const,
        verifiedAt: operationTime.toISOString(),
      };
    });
}
