import type { LiveOperationsMapResponse } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { pointInPolygon, type GeoPoint } from "./point-in-polygon";

type ProjectedArea = NonNullable<
  LiveOperationsMapResponse["items"][number]["position"]
>["areas"][number];

interface AreaRow extends ProjectedArea {
  readonly latitude: string;
  readonly longitude: string;
  readonly position: number;
}

interface AreaWithVertices {
  readonly projection: ProjectedArea;
  readonly vertices: GeoPoint[];
}

export async function loadLiveMapAreas(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<readonly AreaWithVertices[]> {
  const result = await transaction.query<AreaRow>(
    `SELECT area.id::text AS "mapAreaId", area.purpose::text AS purpose,
            area.code, area.label, area.level_label AS "levelLabel",
            area.parking_zone_id::text AS "parkingZoneId",
            vertex.position, vertex.latitude::text, vertex.longitude::text
     FROM location_map_areas AS area
     INNER JOIN location_map_area_vertices AS vertex
       ON vertex.organization_id = area.organization_id
      AND vertex.location_id = area.location_id
      AND vertex.map_area_id = area.id
     WHERE area.organization_id = $1 AND area.location_id = $2
       AND area.active = true
     ORDER BY area.purpose, area.code, area.id, vertex.position`,
    [organizationId, locationId],
  );
  const areas = new Map<string, AreaWithVertices>();
  for (const row of result.rows) {
    let area = areas.get(row.mapAreaId);
    if (area === undefined) {
      area = {
        projection: {
          code: row.code,
          label: row.label,
          levelLabel: row.levelLabel,
          mapAreaId: row.mapAreaId,
          parkingZoneId: row.parkingZoneId,
          purpose: row.purpose,
        },
        vertices: [],
      };
      areas.set(row.mapAreaId, area);
    }
    area.vertices.push({ latitude: row.latitude, longitude: row.longitude });
  }
  return [...areas.values()];
}

export function projectContainingAreas(
  point: GeoPoint,
  areas: readonly AreaWithVertices[],
): readonly ProjectedArea[] {
  return areas
    .filter((area) => pointInPolygon(point, area.vertices))
    .map((area) => area.projection);
}
