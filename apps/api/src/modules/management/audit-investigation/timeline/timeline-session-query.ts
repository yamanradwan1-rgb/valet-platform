import type { AuditInvestigationTimelineSession } from "@valet/contracts";
import type { PostgresTransaction } from "../../../../common/database/postgres";
import { ManagementAccessDeniedError } from "../../management-authorization";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";

interface SessionRow {
  readonly id: string;
  readonly state: AuditInvestigationTimelineSession["currentState"];
  readonly make: string | null;
  readonly model: string | null;
  readonly plate: string | null;
  readonly plateCountry: string | null;
  readonly temporaryDescriptor: string | null;
  readonly keySlotId: string | null;
  readonly slotCode: string | null;
}

function current(value: string | null) {
  const name = value?.trim() ?? "";
  const safe = name.length > 0 && name.length <= 201 && !/\p{Cc}/u.test(name);
  return {
    value: safe ? name : null,
    basis: "CURRENT" as const,
    unavailable: !safe,
  };
}

/** Exact persisted Org/Location/Session containment; never derive scope from URL
 * or return current vehicle as a historical event-time identity. */
export async function readTimelineSession(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  sessionId: string,
): Promise<AuditInvestigationTimelineSession> {
  const result = await tx.query<SessionRow>(
    `SELECT session.id::text AS id, session.state::text AS state,
            vehicle.make, vehicle.model, vehicle.plate_number_raw AS plate,
            vehicle.plate_country AS "plateCountry",
            vehicle.temporary_descriptor AS "temporaryDescriptor",
            session.key_slot_id::text AS "keySlotId",
            slot.code AS "slotCode"
     FROM valet_sessions AS session
     JOIN vehicles AS vehicle
       ON vehicle.organization_id = session.organization_id
      AND vehicle.id = session.vehicle_id
     LEFT JOIN key_slots AS slot
       ON slot.organization_id = session.organization_id
      AND slot.location_id = session.location_id
      AND slot.id = session.key_slot_id
     WHERE session.organization_id = $1::uuid
       AND session.location_id = $2::uuid
       AND session.id = $3::uuid
     FOR SHARE OF session`,
    [scope.organizationId, scope.locationId, sessionId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || !row) throw new ManagementAccessDeniedError();
  return {
    sessionId: row.id,
    currentState: row.state,
    currentStateBasis: "CURRENT",
    currentVehicle: {
      make: current(row.make),
      model: current(row.model),
      plate: current(row.plate),
      plateCountry: current(row.plateCountry),
      temporaryDescriptor: current(row.temporaryDescriptor),
    },
    currentKeySlot: {
      keySlotId: row.keySlotId,
      code: current(row.slotCode),
    },
  };
}
