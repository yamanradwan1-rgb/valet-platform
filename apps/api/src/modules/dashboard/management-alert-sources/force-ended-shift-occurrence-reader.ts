import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  authorizeForceEndedShiftAlert,
  requireAdministrativeAlertQuery,
  type AdministrativeAlertOccurrence,
  type AdministrativeAlertQueryInput,
} from "./administrative-occurrence-authority";

interface ShiftEventRow {
  readonly eventId: string;
  readonly shiftId: string;
  readonly occurredAt: Date;
}

type ShiftInput = AdministrativeAlertQueryInput & {
  readonly locationId: string;
};

/**
 * ALT-13 is an immutable committed Shift force-end event, not a cash alert.
 * DB trigger staff_shift_force_end_guard_audit proves the matching closure,
 * Shift/location, actor and ended_at; direct closure SELECT stays revoked.
 * Event UUID is the stable Seen identity across command replay.
 */
async function forceEndOccurrences(
  transaction: PostgresTransaction,
  input: ShiftInput,
  eventId?: string,
): Promise<AdministrativeAlertOccurrence[]> {
  requireAdministrativeAlertQuery(input, eventId);
  await authorizeForceEndedShiftAlert(transaction, input);
  const result = await transaction.query<ShiftEventRow>(
    `SELECT event.id::text AS "eventId", shift.id::text AS "shiftId",
            event.occurred_at AS "occurredAt"
     FROM audit_events AS event
     INNER JOIN shifts AS shift
       ON shift.organization_id=event.organization_id
      AND shift.id=event.entity_id
      AND shift.location_id=event.location_id
      AND shift.status='ENDED'
      AND shift.ended_at=event.occurred_at
     WHERE event.organization_id=$1::uuid
       AND event.location_id=$2::uuid
       AND event.event_type='SHIFT_FORCE_ENDED'
       AND event.entity_type='Shift'
       AND event.actor_type='MEMBERSHIP'
       AND event.actor_membership_id IS NOT NULL
       AND event.occurred_at>=statement_timestamp()-INTERVAL '7 days'
       AND event.occurred_at<=statement_timestamp()
       ${eventId === undefined ? "" : "AND event.id=$4::uuid"}
     ORDER BY event.occurred_at DESC, event.id DESC
     LIMIT $3`,
    [
      input.organizationId,
      input.locationId,
      input.limit,
      ...(eventId === undefined ? [] : [eventId]),
    ],
  );
  return result.rows.map((row) => ({
    category: "ALT-13",
    eventId: row.eventId,
    targetId: row.shiftId,
    sourceKind: "SHIFT",
    organizationId: input.organizationId,
    locationId: input.locationId,
    occurredAt: row.occurredAt.toISOString(),
    severity: "IMPORTANT",
    title: "Shift administratively ended",
  }));
}

export function queryForcedShiftEndOccurrences(
  transaction: PostgresTransaction,
  input: ShiftInput,
): Promise<AdministrativeAlertOccurrence[]> {
  return forceEndOccurrences(transaction, input);
}

/** Exact event lookup reruns source and current grant checks, not page lookup. */
export async function findForcedShiftEndOccurrence(
  transaction: PostgresTransaction,
  input: Omit<ShiftInput, "limit"> & { readonly eventId: string },
): Promise<AdministrativeAlertOccurrence | null> {
  return (
    (
      await forceEndOccurrences(
        transaction,
        { ...input, limit: 1 },
        input.eventId,
      )
    )[0] ?? null
  );
}
