import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import { loadDispatchOperationTime } from "../dispatch/dispatch-transaction";
import { DispatchOperationError } from "../dispatch/dispatch-errors";
import { CustodyMutationError } from "../valet-sessions/protected-custody-command";
import {
  authorizeParkingCancellation,
  isPreCustody,
} from "./cancel-before-parking-authorization";
import { coherentParkingCancellation } from "./cancel-before-parking-history";
import type { ParkingCancellationCommandInput } from "./cancel-before-parking-types";

export function createCancelBeforeParkingCommandExecutor(
  pool: PostgresPool,
  options: {
    auditEventIdFactory?: () => string;
    dispatchEventIdFactory?: () => string;
  } = {},
) {
  return (input: ParkingCancellationCommandInput) =>
    inPostgresTransaction(pool, async (tx) => {
      const target = await authorizeParkingCancellation(tx, input);
      const { session, task, actorMembershipId } = target;
      if (session.state === "CANCELLED" || task.status === "CANCELLED") {
        const result = await coherentParkingCancellation(
          tx,
          target,
          input.expectedShiftId,
        );
        if (
          input.expectedSessionVersion !== session.version - 1 ||
          input.expectedTaskVersion !== task.version - 1
        )
          throw new CustodyMutationError("VERSION_CONFLICT");
        return result;
      }
      if (
        session.version !== input.expectedSessionVersion ||
        task.version !== input.expectedTaskVersion
      )
        throw new CustodyMutationError("VERSION_CONFLICT");
      if (!["QUEUED", "ASSIGNED", "ACCEPTED"].includes(task.status))
        throw new DispatchOperationError("TASK_INVALID_STATE");
      if (!isPreCustody(target))
        throw new CustodyMutationError("INVALID_STATE_TRANSITION");
      const at = await loadDispatchOperationTime(tx);
      const changedTask = await tx.query<{ version: number }>(
        `UPDATE tasks SET status='CANCELLED', version=version+1, updated_at=$3
       WHERE id=$1 AND version=$2 AND status IN ('QUEUED','ASSIGNED','ACCEPTED')
       RETURNING version`,
        [task.id, task.version, at],
      );
      const changedSession = await tx.query<{ version: number }>(
        `UPDATE valet_sessions SET state='CANCELLED', version=version+1, updated_at=$3
       WHERE id=$1 AND version=$2 AND state='AWAITING_PARKING'
       RETURNING version`,
        [session.id, session.version, at],
      );
      const taskVersion = changedTask.rows[0]?.version;
      const sessionVersion = changedSession.rows[0]?.version;
      if (taskVersion === undefined || sessionVersion === undefined)
        throw new CustodyMutationError("VERSION_CONFLICT");
      await appendDispatchEvent(
        tx,
        {
          task,
          actorMembershipId,
          eventType: "CANCELLED",
          occurredAt: at,
          previousAssigneeMembershipId: task.current_assignee_membership_id,
          newAssigneeMembershipId: task.current_assignee_membership_id,
          reason: null,
        },
        options.dispatchEventIdFactory,
      );
      await appendCustodyAuditEvent(
        tx,
        {
          occurredAt: at,
          scope: {
            actorMembershipId,
            organizationId: session.organization_id,
            locationId: session.location_id,
            valetSessionId: session.id,
          },
          definition: {
            eventType: "VALET_SESSION_PRE_CUSTODY_CANCELLED",
            metadata: {
              taskId: task.id,
              shiftId: input.expectedShiftId,
              fromSessionState: session.state,
              toSessionState: "CANCELLED",
              fromSessionVersion: session.version,
              toSessionVersion: sessionVersion,
              fromTaskStatus: task.status,
              toTaskStatus: "CANCELLED",
              fromTaskVersion: task.version,
              toTaskVersion: taskVersion,
            },
          },
        },
        options.auditEventIdFactory,
      );
      return {
        sessionId: session.id,
        sessionVersion,
        state: "CANCELLED" as const,
        taskId: task.id,
        taskVersion,
        taskStatus: "CANCELLED" as const,
        cancelledAt: at.toISOString(),
      };
    });
}
