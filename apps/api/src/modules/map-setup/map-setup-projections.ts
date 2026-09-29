import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";

interface PointRow {
  active: boolean;
  code: string;
  created_at: Date;
  id: string;
  kind: LocationMapPoint["kind"];
  label: string;
  latitude: string;
  level_label: string | null;
  longitude: string;
  updated_at: Date;
}

interface AreaRow {
  active: boolean;
  code: string;
  created_at: Date;
  id: string;
  label: string;
  level_label: string | null;
  parking_zone_id: string | null;
  parking_zone_code: string | null;
  parking_zone_label: string | null;
  parking_zone_status: "ACTIVE" | "INACTIVE" | null;
  purpose: LocationMapArea["purpose"];
  updated_at: Date;
}

interface VertexRow {
  latitude: string;
  longitude: string;
  map_area_id: string;
  position: number;
}

export async function loadMapPoints(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
  pointId?: string,
): Promise<LocationMapPoint[]> {
  const result = await transaction.query<PointRow>(
    `SELECT id::text, kind::text, code, label, latitude::text,
            longitude::text, level_label, active, created_at, updated_at
     FROM location_map_points
     WHERE organization_id = $1 AND location_id = $2
       AND ($3::uuid IS NULL OR id = $3)
     ORDER BY code, id`,
    [organizationId, locationId, pointId ?? null],
  );
  return result.rows.map((row) => ({
    active: row.active,
    code: row.code,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    kind: row.kind,
    label: row.label,
    latitude: Number(row.latitude),
    levelLabel: row.level_label,
    longitude: Number(row.longitude),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function loadMapAreas(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
  areaId?: string,
): Promise<LocationMapArea[]> {
  const areas = await transaction.query<AreaRow>(
    `SELECT area.id::text, area.parking_zone_id::text, area.purpose::text,
            area.code, area.label, area.level_label, area.active,
            area.created_at, area.updated_at,
            zone.code AS parking_zone_code,
            zone.label AS parking_zone_label,
            zone.status::text AS parking_zone_status
     FROM location_map_areas AS area
     LEFT JOIN parking_zones AS zone
       ON zone.id = area.parking_zone_id
      AND zone.organization_id = area.organization_id
      AND zone.location_id = area.location_id
     WHERE area.organization_id = $1 AND area.location_id = $2
       AND ($3::uuid IS NULL OR area.id = $3)
     ORDER BY area.code, area.id`,
    [organizationId, locationId, areaId ?? null],
  );
  const ids = areas.rows.map((area) => area.id);
  const vertices = await transaction.query<VertexRow>(
    `SELECT map_area_id::text, position, latitude::text, longitude::text
     FROM location_map_area_vertices
     WHERE organization_id = $1 AND location_id = $2
       AND map_area_id = ANY($3::uuid[])
     ORDER BY map_area_id, position`,
    [organizationId, locationId, ids],
  );
  return areas.rows.map((area) => ({
    active: area.active,
    code: area.code,
    createdAt: area.created_at.toISOString(),
    id: area.id,
    label: area.label,
    levelLabel: area.level_label,
    parkingZoneId: area.parking_zone_id,
    parkingZone:
      area.parking_zone_id === null ||
      area.parking_zone_code === null ||
      area.parking_zone_label === null ||
      area.parking_zone_status === null
        ? null
        : {
            code: area.parking_zone_code,
            label: area.parking_zone_label,
            parkingZoneId: area.parking_zone_id,
            status: area.parking_zone_status,
          },
    purpose: area.purpose,
    updatedAt: area.updated_at.toISOString(),
    vertices: vertices.rows
      .filter((vertex) => vertex.map_area_id === area.id)
      .map((vertex) => ({
        latitude: Number(vertex.latitude),
        longitude: Number(vertex.longitude),
        position: vertex.position,
      })),
  }));
}
