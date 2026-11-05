import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/** Fixture geography only; VIOLATION/ENTERED/EXITED must come from GPS writer. */
export async function seedIssue414GeofenceArea(
  pool: Pick<Pool, "query">,
  organizationId: string,
  locationId: string,
  purpose: "RESTRICTED" | "PARKING",
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO location_map_areas
       (id,organization_id,location_id,purpose,code,label,active,updated_at)
     VALUES ($1,$2,$3,$4,$5,'ALT09 GPS fixture',TRUE,clock_timestamp())`,
    [id, organizationId, locationId, purpose, randomUUID()],
  );
  await pool.query(
    `INSERT INTO location_map_area_vertices
       (id,organization_id,location_id,map_area_id,position,latitude,longitude)
     SELECT gen_random_uuid(),$2,$3,$1,vertex.position,
            vertex.latitude,vertex.longitude
     FROM unnest($4::int[],$5::numeric[],$6::numeric[])
       AS vertex(position,latitude,longitude)`,
    [
      id,
      organizationId,
      locationId,
      [0, 1, 2, 3],
      [31, 31, 32, 32],
      [35, 36, 36, 35],
    ],
  );
  return id;
}
