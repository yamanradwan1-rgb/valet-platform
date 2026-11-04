import type { PostgresTransaction } from "../../../common/database/postgres";
import { unseenOccurrenceAntiJoin } from "../management-alert-seen/management-alert-seen-unseen-sql";
import {
  authorizeCustodyOccurrenceAlertSource,
  type CustodyOccurrenceAlertCandidate,
} from "./custody-occurrence-alert-authority";
import {
  requireManagementAlertSourceId,
  type ManagementAlertExactReaderInput,
  type ManagementAlertReaderInput,
} from "./management-alert-source-contract";

interface TakeoverOccurrenceRow {
  readonly operationId: string;
  readonly taskId: string;
  readonly valetSessionId: string;
  readonly occurredAt: Date;
}

async function sourceOccurrences(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
  operationId?: string,
): Promise<CustodyOccurrenceAlertCandidate[]> {
  // Revocation/MFA/source grant must precede selecting even one source row.
  const scope = await authorizeCustodyOccurrenceAlertSource(
    transaction,
    input,
    "ALT-05",
  );
  const exact =
    operationId === undefined
      ? unseenOccurrenceAntiJoin("ALT-05", 4)
      : "AND takeover.operation_id=$4::uuid";
  const result = await transaction.query<TakeoverOccurrenceRow>(
    `SELECT takeover.operation_id::text AS "operationId",
            takeover.task_id::text AS "taskId",
            takeover.valet_session_id::text AS "valetSessionId",
            takeover.occurred_at AS "occurredAt"
     FROM emergency_task_takeover_operations AS takeover
     INNER JOIN dispatch_events AS dispatch
       ON dispatch.organization_id=takeover.organization_id
      AND dispatch.id=takeover.dispatch_event_id
      AND dispatch.location_id=takeover.location_id
      AND dispatch.task_id=takeover.task_id
      AND dispatch.valet_session_id=takeover.valet_session_id
      AND dispatch.event_type='EMERGENCY_TAKEOVER'
      AND dispatch.occurred_at=takeover.occurred_at
      AND dispatch.actor_membership_id=takeover.actor_membership_id
      AND dispatch.previous_assignee_membership_id=takeover.previous_assignee_membership_id
      AND dispatch.new_assignee_membership_id=takeover.new_assignee_membership_id
     INNER JOIN audit_events AS audit
       ON audit.organization_id=takeover.organization_id
      AND audit.id=takeover.audit_event_id
      AND audit.location_id=takeover.location_id
      AND audit.valet_session_id=takeover.valet_session_id
      AND audit.entity_type='Task'
      AND audit.entity_id=takeover.task_id
      AND audit.event_type='TASK_EMERGENCY_TAKEOVER'
      AND audit.occurred_at=takeover.occurred_at
      AND audit.actor_membership_id=takeover.actor_membership_id
      AND audit.metadata_json @> jsonb_build_object(
         'operationId', takeover.operation_id::text,
         'sessionId', takeover.valet_session_id::text,
         'previousAssigneeMembershipId', takeover.previous_assignee_membership_id::text,
         'newAssigneeMembershipId', takeover.new_assignee_membership_id::text,
         'fromStatus', 'IN_PROGRESS', 'toStatus', 'IN_PROGRESS',
         'fromVersion', takeover.expected_task_version,
         'toVersion', takeover.result_task_version,
         'fromSessionVersion', takeover.expected_session_version,
         'toSessionVersion', takeover.result_session_version)
     WHERE takeover.organization_id=$1::uuid
       AND takeover.location_id=$2::uuid
       AND takeover.occurred_at <= clock_timestamp()
       AND takeover.occurred_at >= clock_timestamp() - INTERVAL '7 days'
       ${exact}
     ORDER BY takeover.occurred_at DESC, takeover.operation_id DESC
     LIMIT $3`,
    [
      scope.organizationId,
      scope.locationId,
      input.limit,
      operationId ?? input.context.userId,
    ],
  );
  return result.rows.flatMap((row) => {
    if (
      !(row.occurredAt instanceof Date) ||
      !Number.isFinite(row.occurredAt.getTime())
    ) {
      return [];
    }
    return [
      {
        category: "ALT-05" as const,
        severity: "CRITICAL" as const,
        sourceKind: "EMERGENCY_TAKEOVER" as const,
        sourceId: row.operationId,
        episodeId: row.operationId,
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        valetSessionId: row.valetSessionId,
        taskId: row.taskId,
        occurredAt: row.occurredAt.toISOString(),
        title: "Emergency task takeover",
      },
    ];
  });
}

/** Same committed (Organization, operationId) is returned on replay, never twice. */
export async function queryEmergencyTakeoverAlertOccurrences(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<CustodyOccurrenceAlertCandidate[]> {
  return sourceOccurrences(transaction, input);
}

/** Exact lookup is source-authorized and never limited by a list page. */
export async function findEmergencyTakeoverAlertOccurrence(
  transaction: PostgresTransaction,
  input: ManagementAlertExactReaderInput,
): Promise<CustodyOccurrenceAlertCandidate | null> {
  requireManagementAlertSourceId(input.sourceId);
  return (
    (
      await sourceOccurrences(
        transaction,
        { context: input.context, scope: input.scope, limit: 1 },
        input.sourceId,
      )
    )[0] ?? null
  );
}
