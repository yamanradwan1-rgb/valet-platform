import type { PostgresTransaction } from "../../common/database/postgres";
import { CustodyStaffAuthorizationError } from "./custody-staff-authorizer";

export interface SessionScopeRow {
  check_in_condition_completed_at: Date | null;
  checked_in_by_membership_id: string;
  handoff_pending_at: Date | null;
  id: string;
  key_slot_id: string | null;
  location_id: string;
  organization_id: string;
  parked_at: Date | null;
  parking_spot_id: string | null;
  parking_started_at: Date | null;
  parking_zone_id: string | null;
  state: string;
  vehicle_id: string;
  version: number;
}

export interface TaskRow {
  current_assignee_membership_id: string | null;
  id: string;
  status: string;
  task_type: string;
}

export interface VehicleRow {
  color: string | null;
  id: string;
  make: string | null;
  model: string | null;
  plate_country: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
  updated_at: Date;
}

export interface ParkingRow {
  spotCode: string;
  zoneCode: string;
}

export async function loadSessionScope(
  client: PostgresTransaction,
  sessionId: string,
): Promise<SessionScopeRow> {
  const result = await client.query<SessionScopeRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            vehicle_id::text, state::text, version,
            checked_in_by_membership_id::text,
            check_in_condition_completed_at, key_slot_id::text,
            parking_spot_id::text, parking_zone_id::text,
            parking_started_at, parked_at, handoff_pending_at
     FROM valet_sessions
     WHERE id = $1
     FOR SHARE`,
    [sessionId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }
  return row;
}

export async function loadParkingTasks(
  client: PostgresTransaction,
  session: SessionScopeRow,
): Promise<TaskRow[]> {
  const result = await client.query<TaskRow>(
    `SELECT id::text, status::text, task_type::text,
            current_assignee_membership_id::text
     FROM tasks
     WHERE organization_id = $1
       AND location_id = $2
       AND valet_session_id = $3
       AND task_type IN ('PARKING', 'RETRIEVAL')
     FOR SHARE`,
    [session.organization_id, session.location_id, session.id],
  );
  return result.rows;
}

export async function loadVehicle(
  client: PostgresTransaction,
  session: SessionScopeRow,
): Promise<VehicleRow> {
  const result = await client.query<VehicleRow>(
    `SELECT id::text, make, model, color, plate_country,
            plate_number_raw, temporary_descriptor, updated_at
     FROM vehicles
     WHERE id = $1 AND organization_id = $2
     FOR SHARE`,
    [session.vehicle_id, session.organization_id],
  );
  const vehicle = result.rows[0];
  if (vehicle === undefined) {
    throw new Error("Corrupted state: referenced vehicle missing.");
  }
  return vehicle;
}

export async function loadKeySlot(
  client: PostgresTransaction,
  session: SessionScopeRow,
): Promise<{ code: string } | null> {
  if (session.key_slot_id === null) return null;
  const result = await client.query<{ code: string }>(
    `SELECT code
     FROM key_slots
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
     FOR SHARE`,
    [session.key_slot_id, session.organization_id, session.location_id],
  );
  const slot = result.rows[0];
  if (slot === undefined) {
    throw new Error("Corrupted state: referenced key slot missing or invalid.");
  }
  return slot;
}

export async function loadParking(
  client: PostgresTransaction,
  session: SessionScopeRow,
): Promise<ParkingRow | null> {
  if (session.parking_spot_id === null) return null;
  const result = await client.query<{
    spot_code: string;
    spot_zone_id: string;
    zone_code: string;
  }>(
    `SELECT spot.code AS spot_code, spot.parking_zone_id::text AS spot_zone_id,
            zone.code AS zone_code
     FROM parking_spots AS spot
     INNER JOIN parking_zones AS zone
       ON zone.id = spot.parking_zone_id
      AND zone.organization_id = spot.organization_id
      AND zone.location_id = spot.location_id
     WHERE spot.id = $1
       AND spot.organization_id = $2
       AND spot.location_id = $3
     FOR SHARE OF spot, zone`,
    [session.parking_spot_id, session.organization_id, session.location_id],
  );
  const row = result.rows[0];
  if (
    row === undefined ||
    (session.parking_zone_id !== null &&
      session.parking_zone_id !== row.spot_zone_id)
  ) {
    throw new Error("Corrupted state: referenced spot/zone invalid.");
  }
  return { spotCode: row.spot_code, zoneCode: row.zone_code };
}

export interface HandoffVerificationFact {
  readonly method: "DYNAMIC_QR" | "PICKUP_CODE" | "SUPERVISOR_OVERRIDE";
  readonly verifiedAt: Date | null;
}

/**
 * Safe handoff verification fact for the staff A1 read. Reads only the
 * authoritative unconsumed verification row; never exposes secret hash,
 * raw proof, attempts, expiry, or override reason.
 */
export async function loadHandoffVerification(
  client: PostgresTransaction,
  session: SessionScopeRow,
): Promise<HandoffVerificationFact | null> {
  if (session.state !== "HANDOFF_PENDING") return null;
  const result = await client.query<{
    method: HandoffVerificationFact["method"];
    verified_at: Date | null;
  }>(
    `SELECT method::text AS method, verified_at
     FROM handoff_verifications
     WHERE organization_id = $1 AND valet_session_id = $2
       AND consumed_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 1
     FOR SHARE`,
    [session.organization_id, session.id],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return { method: row.method, verifiedAt: row.verified_at };
}
