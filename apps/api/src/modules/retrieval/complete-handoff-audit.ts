import type { PostgresTransaction } from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import type { ReleaseEligibleVerification } from "./handoff-release-guard";
import type {
  LockedCompleteHandoffRequest,
  LockedCompleteHandoffSession,
  LockedCompleteHandoffTask,
} from "./complete-handoff-types";

export async function appendCompleteHandoffAudit(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly keySlotId: string;
    readonly operationTime: Date;
    readonly request: LockedCompleteHandoffRequest;
    readonly session: LockedCompleteHandoffSession;
    readonly sessionVersion: number;
    readonly task: LockedCompleteHandoffTask;
    readonly taskVersion: number;
    readonly verification: ReleaseEligibleVerification;
  },
  auditEventIdFactory?: () => string,
): Promise<void> {
  const scope = {
    actorMembershipId: input.actorMembershipId,
    locationId: input.session.location_id,
    organizationId: input.session.organization_id,
    valetSessionId: input.session.id,
  };
  await appendCustodyAuditEvent(
    transaction,
    {
      definition: {
        eventType: "VALET_SESSION_VEHICLE_RELEASED",
        metadata: {
          handoff_method: input.verification.method,
          key_slot_id: input.keySlotId,
          task_id: input.task.id,
        },
      },
      occurredAt: input.operationTime,
      scope,
    },
    auditEventIdFactory,
  );
  await appendCustodyAuditEvent(
    transaction,
    {
      definition: {
        eventType: "VALET_SESSION_COMPLETED",
        metadata: {
          from_session_state: "HANDOFF_PENDING",
          from_session_version: input.session.version,
          from_task_status: "IN_PROGRESS",
          from_task_version: input.task.version,
          retrieval_request_id: input.request.id,
          task_id: input.task.id,
          to_session_state: "COMPLETED",
          to_session_version: input.sessionVersion,
          to_task_status: "COMPLETED",
          to_task_version: input.taskVersion,
        },
      },
      occurredAt: input.operationTime,
      scope,
    },
    auditEventIdFactory,
  );
}
