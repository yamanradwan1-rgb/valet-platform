import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/** Synthetic PG17 fixture, not an operational writer or audit source. */
export async function seedAlertAggregateIncidentHistory(
  adminPool: Pool,
  input: {
    readonly organizationId: string;
    readonly locationId: string;
    readonly reporterMembershipId: string;
    readonly activeCount: number;
    readonly historicalCount: number;
  },
): Promise<void> {
  const rows = Array.from(
    { length: input.activeCount + input.historicalCount },
    (_, index) => ({
      vehicleId: randomUUID(),
      sessionId: randomUUID(),
      incidentId: randomUUID(),
      token: randomUUID(),
      active: index < input.activeCount,
    }),
  );
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO vehicles
         (id, organization_id, plate_country, plate_number_raw,
          plate_number_normalized, updated_at)
       SELECT data.id, $3, 'JO', data.plate, data.plate,
              clock_timestamp()
       FROM unnest($1::uuid[], $2::text[]) AS data(id, plate)`,
      [
        rows.map((row) => row.vehicleId),
        rows.map((row) => row.vehicleId.replaceAll("-", "")),
        input.organizationId,
      ],
    );
    await client.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          checked_in_by_membership_id, updated_at)
       SELECT data.id, data.token, clock_timestamp() + interval '1 day',
              $4, $5, data.vehicle_id, 'PARKED', $6, clock_timestamp()
       FROM unnest($1::uuid[], $2::text[], $3::uuid[])
         AS data(id, token, vehicle_id)`,
      [
        rows.map((row) => row.sessionId),
        rows.map((row) => row.token),
        rows.map((row) => row.vehicleId),
        input.organizationId,
        input.locationId,
        input.reporterMembershipId,
      ],
    );
    await client.query(
      `INSERT INTO incidents
         (id, organization_id, location_id, valet_session_id,
          status, severity, type, description, reported_by_membership_id,
          created_at)
       SELECT data.id, $3, $4, data.session_id, data.status::incident_status,
              'HIGH', 'KEY_MISSING', 'Synthetic alert load fixture', $5,
              clock_timestamp()
       FROM unnest($1::uuid[], $2::uuid[], $6::text[])
         AS data(id, session_id, status)`,
      [
        rows.map((row) => row.incidentId),
        rows.map((row) => row.sessionId),
        input.organizationId,
        input.locationId,
        input.reporterMembershipId,
        rows.map((row) => (row.active ? "OPEN" : "RESOLVED")),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
