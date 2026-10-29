import type { PostgresPool } from "../../common/database/postgres";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { classifyEmergencyTakeoverDomain } from "./emergency-takeover-domain";
import { consumeUnconsumedHandoffProofsForTakeover } from "../retrieval/handoff-takeover-proof-guard";
import { transitionTaskTrackingForEmergencyTakeover } from "../tracking/tracking-takeover-attribution";
import {
  requireCurrentEmergencyCredential,
  requireEmergencyReplacement,
  requireEmergencyTakeoverActor,
} from "./emergency-takeover-authorization";
import { DispatchOperationError } from "./dispatch-errors";
import { inDispatchTransaction } from "./dispatch-transaction";
import { appendEmergencyTakeoverHistory } from "./emergency-takeover-history";
import {
  findEmergencyReceipt,
  fingerprintEmergencyIntent,
  insertEmergencyReceipt,
  lockEmergencyOperationIdentity,
  replayEmergencyReceipt,
} from "./emergency-takeover-idempotency";
import {
  hintEmergencyTaskSession,
  lockEmergencyRetrievalRequestStatus,
  lockEmergencySession,
  lockEmergencyTask,
  lockEmergencyTrackingFrontier,
  requireEmergencyInProgress,
} from "./emergency-takeover-locks";
import {
  advanceEmergencySessionVersion,
  mutateEmergencyTaskOwner,
} from "./emergency-takeover-mutation";
import type {
  EmergencyTakeoverCommandRequest,
  EmergencyTakeoverCommandResult,
} from "./emergency-takeover-types";

function takeoverIntegrityConflict(): never {
  throw new DispatchOperationError("TASK_INVALID_STATE");
}

/** Dedicated emergency path: ordinary ASSIGNED/ACCEPTED Reassign stays unchanged. */
export function createEmergencyTakeoverCommandExecutor(pool: PostgresPool) {
  return (
    request: EmergencyTakeoverCommandRequest,
  ): Promise<EmergencyTakeoverCommandResult> =>
    inDispatchTransaction(pool, async (tx) => {
      // W3 already authenticates the principal; lock the physical Session before
      // the Task, then recheck the credential in the protected transaction.
      const sessionId = await hintEmergencyTaskSession(tx, request.taskId);
      const session = await lockEmergencySession(tx, sessionId);
      // Current credential is required even on identical historical replay.
      await requireCurrentEmergencyCredential(tx, request.staffSessionContext);
      const task = await lockEmergencyTask(tx, request.taskId, session);
      const actor = await requireEmergencyTakeoverActor(
        tx,
        session,
        request.staffSessionContext,
      );

      const reason = request.reason.trim();
      const fingerprint = fingerprintEmergencyIntent(
        request,
        actor.membershipId,
        session,
        reason,
      );
      await lockEmergencyOperationIdentity(
        tx,
        session.organization_id,
        request.operationId,
      );
      const prior = await findEmergencyReceipt(
        tx,
        session.organization_id,
        request.operationId,
      );
      if (prior !== undefined) {
        const replay = replayEmergencyReceipt(prior, fingerprint);
        if (actor.role === "ORG_ADMIN") {
          await recordAdminActivityInTransaction(
            tx,
            request.staffSessionContext,
          );
        }
        return replay;
      }

      if (task.version !== request.expectedVersion) {
        throw new DispatchOperationError("VERSION_CONFLICT");
      }
      requireEmergencyInProgress(task);
      if (
        reason.length === 0 ||
        reason.length > 500 ||
        /\p{Cc}/u.test(reason)
      ) {
        throw new DispatchOperationError("EMERGENCY_TAKEOVER_REASON_INVALID");
      }
      await requireEmergencyReplacement(
        tx,
        session,
        request.targetAssigneeMembershipId,
      );
      const requestStatus =
        task.task_type === "RETRIEVAL"
          ? await lockEmergencyRetrievalRequestStatus(tx, session)
          : null;
      const verdict = classifyEmergencyTakeoverDomain({
        currentAssigneeMembershipId: task.current_assignee_membership_id,
        replacementAssigneeMembershipId: request.targetAssigneeMembershipId,
        retrievalRequestStatus: requestStatus,
        sessionState: session.state,
        taskStatus: task.status,
        taskType: task.task_type,
      });
      if (!verdict.allowed) {
        throw new DispatchOperationError(
          verdict.reason === "INVALID_OWNER"
            ? "TASK_ASSIGNMENT_CONFLICT"
            : "TASK_INVALID_STATE",
        );
      }

      // Wait for preceding A GPS transaction before sampling DB time/fencing A.
      await lockEmergencyTrackingFrontier(tx, session);
      const clock = await tx.query<{ operation_time: Date }>(
        `SELECT clock_timestamp()::timestamptz(3) AS operation_time`,
      );
      const operationTime = clock.rows[0]?.operation_time;
      if (operationTime === undefined)
        throw new Error("Missing database takeover time.");

      await consumeUnconsumedHandoffProofsForTakeover(
        tx,
        {
          organizationId: session.organization_id,
          sessionId: session.id,
          sessionState: session.state,
          operationTime,
        },
        takeoverIntegrityConflict,
      );
      const changedTracking = await transitionTaskTrackingForEmergencyTakeover(
        tx,
        {
          organizationId: session.organization_id,
          locationId: session.location_id,
          sessionId: session.id,
          taskId: task.id,
          fromAssigneeMembershipId: task.current_assignee_membership_id,
          toAssigneeMembershipId: request.targetAssigneeMembershipId,
          movementActive: verdict.movementActive,
          operationTime,
        },
        takeoverIntegrityConflict,
      );

      await mutateEmergencyTaskOwner(
        tx,
        task,
        request.targetAssigneeMembershipId,
        operationTime,
      );
      const sessionVersion = await advanceEmergencySessionVersion(
        tx,
        session,
        operationTime,
      );
      const history = await appendEmergencyTakeoverHistory(tx, {
        session,
        task,
        actorMembershipId: actor.membershipId,
        newAssigneeMembershipId: request.targetAssigneeMembershipId,
        reason,
        operationId: request.operationId,
        operationTime,
      });
      await insertEmergencyReceipt(tx, {
        request,
        session,
        task,
        actorMembershipId: actor.membershipId,
        fingerprint,
        operationTime,
        dispatchEventId: history.dispatchEventId,
        auditEventId: history.auditEventId,
        tracking: {
          endedOldTrackingSessionId: changedTracking.endedTrackingSessionId,
          newTrackingSessionId: changedTracking.startedTrackingSessionId,
        },
      });
      if (actor.role === "ORG_ADMIN") {
        await recordAdminActivityInTransaction(tx, request.staffSessionContext);
      }
      return {
        operationId: request.operationId,
        replayed: false,
        task: {
          id: task.id,
          status: "IN_PROGRESS" as const,
          version: task.version + 1,
          assigneeMembershipId: request.targetAssigneeMembershipId,
        },
        sessionVersion,
      };
    });
}
