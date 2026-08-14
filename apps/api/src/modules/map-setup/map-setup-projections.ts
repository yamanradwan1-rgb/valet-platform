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
    `SELECT id::text, parking_zone_id::text, purpose::text, code, label,
            level_label, active, created_at, updated_at
     FROM location_map_areas
     WHERE organization_id = $1 AND location_id = $2
       AND ($3::uuid IS NULL OR id = $3)
     ORDER BY code, id`,
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
