import type { PostgresTransaction } from "../../common/database/postgres";
import {
  parkingAuditDiscoverySql,
  type ParkingAuditEvidence,
} from "./operational-history-audit-discovery";
import type { ParkingTaskDispatchEvidence } from "./operational-history-evidence-classifier";

const parkingTaskEvidenceSql = `SELECT task.valet_session_id::text AS "sessionId",
       task.id::text AS "taskId", task.status::text AS status,
       task.version AS "taskVersion",
       task.current_assignee_membership_id::text AS "ownerId",
       event.id::text AS "dispatchId",
       event.actor_membership_id::text AS "actorId",
       event.new_assignee_membership_id::text AS "newAssigneeId",
       event.previous_assignee_membership_id::text AS "previousAssigneeId",
       event.reason, event.occurred_at AS "occurredAt"
  FROM tasks AS task
  LEFT JOIN dispatch_events AS event
    ON event.organization_id = task.organization_id
   AND event.location_id = task.location_id
   AND event.valet_session_id = task.valet_session_id
   AND event.task_id = task.id AND event.event_type = 'COMPLETED'
  WHERE task.organization_id = $1 AND task.location_id = $2
    AND task.valet_session_id = ANY($3::uuid[])
    AND task.task_type = 'PARKING'`;

/**
 * A READ COMMITTED transaction can otherwise observe Task/Dispatch at one
 * snapshot and Audit at a later snapshot. This single SQL statement ensures
 * all completion evidence shares one PostgreSQL statement snapshot, without
 * switching the authorization transaction to potentially stale REPEATABLE READ.
 * No candidate cap: JSONB is solely a typed-row transport for UNION ALL.
 */
export const atomicParkingEvidenceSql = `
  SELECT 'TASK'::text AS "kind", to_jsonb(task_row) AS "payload"
  FROM (${parkingTaskEvidenceSql}) AS task_row
  UNION ALL
  SELECT 'AUDIT'::text AS "kind", to_jsonb(audit_row) AS "payload"
  FROM (${parkingAuditDiscoverySql}) AS audit_row`;

interface AtomicEvidenceRow {
  readonly kind: string;
  readonly payload: unknown;
}

function objectPayload(value: unknown): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Malformed historical evidence row.");
  }
  return value as Record<string, unknown>;
}

function parsedTimestamp(value: unknown): Date {
  return new Date(typeof value === "string" ? value : NaN);
}

export async function readAtomicParkingEvidence(
  transaction: PostgresTransaction,
  input: {
    readonly organizationId: string;
    readonly locationId: string;
    readonly sessionIds: readonly string[];
  },
): Promise<{
  readonly tasks: readonly ParkingTaskDispatchEvidence[];
  readonly audits: readonly ParkingAuditEvidence[];
}> {
  if (input.sessionIds.length === 0) return { tasks: [], audits: [] };
  const result = await transaction.query<AtomicEvidenceRow>(
    atomicParkingEvidenceSql,
    [input.organizationId, input.locationId, input.sessionIds],
  );
  const tasks: ParkingTaskDispatchEvidence[] = [];
  const audits: ParkingAuditEvidence[] = [];
  for (const row of result.rows) {
    const payload = objectPayload(row.payload);
    const occurredAt = payload.occurredAt === null
      ? null
      : parsedTimestamp(payload.occurredAt);
    if (row.kind === "TASK") {
      tasks.push({
        ...payload,
        occurredAt,
      } as unknown as ParkingTaskDispatchEvidence);
    } else if (row.kind === "AUDIT") {
      audits.push({
        ...payload,
        occurredAt: occurredAt ?? new Date(NaN),
      } as unknown as ParkingAuditEvidence);
    } else {
      throw new Error("Unknown historical evidence discriminator.");
    }
  }
  return { tasks, audits };
}
