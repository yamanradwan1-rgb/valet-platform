import type { PostgresTransaction } from "../../common/database/postgres";

/**
 * Candidate row for the vehicle directory read. Carries exactly the columns
 * needed for ordering, projection and visibility classification; never
 * custody secrets or guest credential material.
 */
export interface DirectoryCandidateRow {
  checked_in_by_membership_id: string;
  created_at: Date;
  id: string;
  key_slot_id: string | null;
  parking_spot_id: string | null;
  parking_zone_id: string | null;
  state: string;
  updated_at: Date;
  vehicle_id: string;
}

export interface DirectoryLocationScope {
  readonly organizationId: string;
}

export interface DirectoryTaskRow {
  current_assignee_membership_id: string | null;
  id: string;
  status: string;
  task_type: string;
  valet_session_id: string;
}

export interface DirectoryVehicleRow {
  color: string | null;
  id: string;
  make: string | null;
  model: string | null;
  plate_country: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
}

export interface DirectoryParkingRow {
  spot_code: string;
  spot_id: string;
  zone_code: string;
}

export interface DirectoryZoneRow {
  code: string;
  id: string;
}

export interface DirectoryKeySlotRow {
  code: string;
  id: string;
}

/** Safety cap for one directory page (DEC-066 §9). */
export const DIRECTORY_PAGE_LIMIT = 100;
/** Fetch one extra candidate so `truncated` can be derived deterministically. */
export const DIRECTORY_FETCH_LIMIT = DIRECTORY_PAGE_LIMIT + 1;

/** Pure page-cap derivation, unit-testable without a database. */
export function applyDirectoryPageCap<T>(candidates: readonly T[]): {
  readonly rows: T[];
  readonly truncated: boolean;
} {
  if (candidates.length > DIRECTORY_PAGE_LIMIT) {
    return { rows: candidates.slice(0, DIRECTORY_PAGE_LIMIT), truncated: true };
  }
  return { rows: [...candidates], truncated: false };
}

/**
 * Resolves the requested Location selector to its persisted Organization
 * under transactional locking. The selector proves nothing by itself; the
 * caller must still prove actor membership/role/access/eligibility.
 */
export async function resolveDirectoryLocationScope(
  client: PostgresTransaction,
  locationId: string,
): Promise<DirectoryLocationScope | null> {
  const result = await client.query<{ organization_id: string }>(
    `SELECT organization.id::text AS organization_id
     FROM locations AS location
     INNER JOIN organizations AS organization
       ON organization.id = location.organization_id
     WHERE location.id = $1
     FOR SHARE OF location, organization`,
    [locationId],
  );
  const row = result.rows[0];
  return row === undefined ? null : { organizationId: row.organization_id };
}

/**
 * Loads the non-COMPLETED candidate sessions of the proven tenant scope in
 * deterministic order (newest first, id ascending tiebreak) with a one-row
 * overflow fetch used only to derive `truncated`.
 */
export async function loadDirectoryCandidates(
  client: PostgresTransaction,
  organizationId: string,
  locationId: string,
  membershipId: string | null = null,
): Promise<DirectoryCandidateRow[]> {
  const result = await client.query<DirectoryCandidateRow>(
    `SELECT id::text, state::text,
            checked_in_by_membership_id::text,
            vehicle_id::text, key_slot_id::text, parking_spot_id::text,
            parking_zone_id::text,
            created_at, updated_at
     FROM valet_sessions
     WHERE organization_id = $1
       AND location_id = $2
       AND state NOT IN ('COMPLETED', 'CANCELLED')
     ORDER BY (state = 'CHECKING_IN' AND checked_in_by_membership_id = $3) DESC NULLS LAST,
              created_at DESC, id ASC
     LIMIT ${DIRECTORY_FETCH_LIMIT}
     FOR SHARE`,
    [organizationId, locationId, membershipId],
  );
  return result.rows;
}

/** Batch-loads PARKING/RETRIEVAL tasks for the capped candidate set. */
export async function loadDirectoryTasks(
  client: PostgresTransaction,
  organizationId: string,
  locationId: string,
  sessionIds: readonly string[],
): Promise<DirectoryTaskRow[]> {
  if (sessionIds.length === 0) return [];
  const result = await client.query<DirectoryTaskRow>(
    `SELECT id::text, status::text, task_type::text,
            current_assignee_membership_id::text,
            valet_session_id::text
     FROM tasks
     WHERE organization_id = $1
       AND location_id = $2
       AND valet_session_id = ANY($3::uuid[])
       AND task_type IN ('PARKING', 'RETRIEVAL')
     FOR SHARE`,
    [organizationId, locationId, [...sessionIds]],
  );
  return result.rows;
}

/** Batch-loads vehicle descriptors for the candidate set, tenant-scoped. */
export async function loadDirectoryVehicles(
  client: PostgresTransaction,
  organizationId: string,
  vehicleIds: readonly string[],
): Promise<Map<string, DirectoryVehicleRow>> {
  const byId = new Map<string, DirectoryVehicleRow>();
  if (vehicleIds.length === 0) return byId;
  const result = await client.query<DirectoryVehicleRow>(
    `SELECT id::text, make, model, color, plate_country,
            plate_number_raw, temporary_descriptor
     FROM vehicles
     WHERE id = ANY($1::uuid[])
       AND organization_id = $2
     FOR SHARE`,
    [[...vehicleIds], organizationId],
  );
  for (const row of result.rows) byId.set(row.id, row);
  return byId;
}

/** Batch-loads parked spot + derived zone codes for the candidate set. */
export async function loadDirectoryParking(
  client: PostgresTransaction,
  organizationId: string,
  locationId: string,
  spotIds: readonly string[],
): Promise<Map<string, DirectoryParkingRow>> {
  const bySpotId = new Map<string, DirectoryParkingRow>();
  if (spotIds.length === 0) return bySpotId;
  const result = await client.query<DirectoryParkingRow>(
    `SELECT spot.id::text AS spot_id, spot.code AS spot_code,
            zone.code AS zone_code
     FROM parking_spots AS spot
     INNER JOIN parking_zones AS zone
       ON zone.id = spot.parking_zone_id
      AND zone.organization_id = spot.organization_id
      AND zone.location_id = spot.location_id
     WHERE spot.id = ANY($1::uuid[])
       AND spot.organization_id = $2
       AND spot.location_id = $3
     FOR SHARE OF spot, zone`,
    [[...spotIds], organizationId, locationId],
  );
  for (const row of result.rows) bySpotId.set(row.spot_id, row);
  return bySpotId;
}

/** Batch-loads persisted parking zones for zone-only parked candidates. */
export async function loadDirectoryZones(
  client: PostgresTransaction,
  organizationId: string,
  locationId: string,
  zoneIds: readonly string[],
): Promise<Map<string, DirectoryZoneRow>> {
  const byZoneId = new Map<string, DirectoryZoneRow>();
  if (zoneIds.length === 0) return byZoneId;
  const result = await client.query<DirectoryZoneRow>(
    `SELECT id::text, code FROM parking_zones
     WHERE id = ANY($1::uuid[]) AND organization_id = $2 AND location_id = $3
     FOR SHARE`,
    [[...zoneIds], organizationId, locationId],
  );
  for (const row of result.rows) byZoneId.set(row.id, row);
  return byZoneId;
}

/** Batch-loads current Key Slot codes for the candidate set, scope-checked. */
export async function loadDirectoryKeySlots(
  client: PostgresTransaction,
  organizationId: string,
  locationId: string,
  slotIds: readonly string[],
): Promise<Map<string, DirectoryKeySlotRow>> {
  const bySlotId = new Map<string, DirectoryKeySlotRow>();
  if (slotIds.length === 0) return bySlotId;
  const result = await client.query<DirectoryKeySlotRow>(
    `SELECT id::text, code
     FROM key_slots
     WHERE id = ANY($1::uuid[])
       AND organization_id = $2
       AND location_id = $3
     FOR SHARE`,
    [[...slotIds], organizationId, locationId],
  );
  for (const row of result.rows) bySlotId.set(row.id, row);
  return bySlotId;
}
