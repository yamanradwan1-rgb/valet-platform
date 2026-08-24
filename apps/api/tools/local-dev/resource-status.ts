export interface ResourceOccupancyRow {
  readonly code: string;
  readonly location_code: string;
  readonly slot_status: string;
  readonly session_id: string | null;
  readonly session_state: string | null;
  readonly plate_number_raw: string | null;
  readonly temporary_descriptor: string | null;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function toResourceOccupancyRows(
  rows: readonly Record<string, unknown>[],
): ResourceOccupancyRow[] {
  return rows.map((row) => ({
    code: String(row.code),
    location_code: String(row.location_code),
    slot_status: String(row.slot_status),
    session_id: optionalText(row.session_id),
    session_state: optionalText(row.session_state),
    plate_number_raw: optionalText(row.plate_number_raw),
    temporary_descriptor: optionalText(row.temporary_descriptor),
  }));
}

export type OccupancyState = "FREE" | "OCCUPIED";

export interface OccupancyClassification {
  readonly active: boolean;
  readonly code: string;
  readonly locationCode: string;
  readonly occupancy: OccupancyState;
  readonly sessionId?: string;
  readonly sessionState?: string;
  readonly vehicleDescriptor?: string;
}

const UNDESCRIBED_VEHICLE = "(vehicle undescribed)";

function classifyRow(row: ResourceOccupancyRow): OccupancyClassification {
  const occupied = row.session_id !== null && row.session_id !== undefined;
  return {
    active: row.slot_status === "ACTIVE",
    code: row.code,
    locationCode: row.location_code,
    occupancy: occupied ? "OCCUPIED" : "FREE",
    ...(occupied
      ? {
          sessionId: row.session_id,
          sessionState: row.session_state ?? "(unknown state)",
          vehicleDescriptor:
            row.plate_number_raw ??
            row.temporary_descriptor ??
            UNDESCRIBED_VEHICLE,
        }
      : {}),
  };
}

export function classifyResourceRows(
  rows: readonly ResourceOccupancyRow[],
): OccupancyClassification[] {
  return [...rows].sort(compareRows).map(classifyRow);
}

function compareRows(
  left: ResourceOccupancyRow,
  right: ResourceOccupancyRow,
): number {
  const byLocation =
    left.location_code < right.location_code
      ? -1
      : left.location_code > right.location_code
        ? 1
        : 0;
  if (byLocation !== 0) return byLocation;
  return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
}

export function formatOccupancyLines(
  classifications: readonly OccupancyClassification[],
): string[] {
  return classifications.map((classification) => {
    const parts = [
      classification.code,
      classification.occupancy === "OCCUPIED"
        ? `OCCUPIED | ${classification.sessionState} | ${classification.vehicleDescriptor} | session ${classification.sessionId}`
        : "FREE",
      ...(classification.active ? [] : ["slot INACTIVE"]),
    ];
    return parts.join(" | ");
  });
}

export function assertCanonicalFreeResources(
  classifications: readonly OccupancyClassification[],
  requiredFreeCodes: readonly string[],
): void {
  for (const requiredCode of requiredFreeCodes) {
    const match = classifications.find(
      (classification) => classification.code === requiredCode,
    );
    if (match === undefined) {
      throw new Error(
        `Canonical resource ${requiredCode} is missing from the seeded local database.`,
      );
    }
    if (match.occupancy !== "FREE") {
      throw new Error(
        `Canonical resource ${requiredCode} must be FREE after bootstrap but is ${match.occupancy}.`,
      );
    }
  }
}

export const KEY_SLOT_OCCUPANCY_SQL = [
  "SELECT k.code AS code,",
  "       k.status AS slot_status,",
  "       l.code AS location_code,",
  "       s.id AS session_id,",
  "       s.state AS session_state,",
  "       v.plate_number_raw AS plate_number_raw,",
  "       v.temporary_descriptor AS temporary_descriptor",
  "FROM key_slots k",
  "JOIN locations l ON l.id = k.location_id",
  "LEFT JOIN valet_sessions s ON s.key_slot_id = k.id",
  "LEFT JOIN vehicles v ON v.id = s.vehicle_id",
  "ORDER BY l.code, k.code",
].join(" ");

export const PARKING_SPOT_OCCUPANCY_SQL = [
  "SELECT p.code AS code,",
  "       p.status AS slot_status,",
  "       l.code AS location_code,",
  "       z.code AS zone_code,",
  "       s.id AS session_id,",
  "       s.state AS session_state,",
  "       v.plate_number_raw AS plate_number_raw,",
  "       v.temporary_descriptor AS temporary_descriptor",
  "FROM parking_spots p",
  "JOIN locations l ON l.id = p.location_id",
  "LEFT JOIN parking_zones z ON z.id = p.parking_zone_id",
  "LEFT JOIN valet_sessions s ON s.parking_spot_id = p.id",
  "LEFT JOIN vehicles v ON v.id = s.vehicle_id",
  "ORDER BY l.code, p.code",
].join(" ");
