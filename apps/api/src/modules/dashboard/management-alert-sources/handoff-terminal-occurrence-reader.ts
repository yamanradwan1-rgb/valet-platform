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

interface HandoffOccurrenceRow {
  readonly eventId: string;
  readonly eventType:
    "HANDOFF_VERIFICATION_FAILED" | "HANDOFF_SUPERVISOR_OVERRIDE";
  readonly valetSessionId: string;
  readonly occurredAt: Date;
}

async function sourceOccurrences(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
  eventId?: string,
): Promise<CustodyOccurrenceAlertCandidate[]> {
  const scope = await authorizeCustodyOccurrenceAlertSource(
    transaction,
    input,
    "ALT-07",
  );
  const exact =
    eventId === undefined
      ? unseenOccurrenceAntiJoin("ALT-07", 4)
      : "AND event.id=$4::uuid";
  const result = await transaction.query<HandoffOccurrenceRow>(
    `SELECT event.id::text AS "eventId",
            event.event_type AS "eventType",
            event.valet_session_id::text AS "valetSessionId",
            event.occurred_at AS "occurredAt"
     FROM audit_events AS event
     INNER JOIN valet_sessions AS session
       ON session.id=event.valet_session_id
      AND session.organization_id=event.organization_id
      AND session.location_id=event.location_id
     WHERE event.organization_id=$1::uuid
       AND event.location_id=$2::uuid
       AND event.entity_type='ValetSession'
       AND event.entity_id=event.valet_session_id
       AND event.actor_type='MEMBERSHIP'
       AND (
         (event.event_type='HANDOFF_VERIFICATION_FAILED'
           AND event.metadata_json @> '{"terminalized":true}'::jsonb)
         OR event.event_type='HANDOFF_SUPERVISOR_OVERRIDE'
       )
       AND event.occurred_at <= clock_timestamp()
       AND event.occurred_at >= clock_timestamp() - INTERVAL '7 days'
       ${exact}
     ORDER BY event.occurred_at DESC, event.id DESC
     LIMIT $3`,
    [
      scope.organizationId,
      scope.locationId,
      input.limit,
      eventId ?? input.context.userId,
    ],
  );
  return result.rows.flatMap((row) => {
    if (
      !(row.occurredAt instanceof Date) ||
      !Number.isFinite(row.occurredAt.getTime())
    ) {
      return [];
    }
    if (
      row.eventType !== "HANDOFF_VERIFICATION_FAILED" &&
      row.eventType !== "HANDOFF_SUPERVISOR_OVERRIDE"
    ) {
      return [];
    }
    const override = row.eventType === "HANDOFF_SUPERVISOR_OVERRIDE";
    return [
      {
        category: "ALT-07" as const,
        severity: "CRITICAL" as const,
        sourceKind: override
          ? ("HANDOFF_SUPERVISOR_OVERRIDE" as const)
          : ("TERMINAL_HANDOFF_FAILURE" as const),
        sourceId: row.eventId,
        episodeId: row.eventId,
        organizationId: scope.organizationId,
        locationId: scope.locationId,
        valetSessionId: row.valetSessionId,
        occurredAt: row.occurredAt.toISOString(),
        title: override
          ? "Supervisor handoff override"
          : "Handoff verification exhausted",
      },
    ];
  });
}

/**
 * A terminal failure has one committed audit-event identity. The writer does
 * not persist verificationId in audit metadata, so no proof-rotation grouping
 * or timestamp/UUID ordering is fabricated. Override is always independent.
 */
export async function queryHandoffTerminalAlertOccurrences(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<CustodyOccurrenceAlertCandidate[]> {
  return sourceOccurrences(transaction, input);
}

export async function findHandoffTerminalAlertOccurrence(
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
