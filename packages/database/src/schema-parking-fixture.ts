import { randomUUID } from "node:crypto";

import type { Client } from "pg";

interface TenantScope {
  locationId: string;
  organizationId: string;
}

interface ParkingSpotValues {
  code?: string;
  label?: string;
  status?: string;
}

export async function createScopedParkingSpot(
  client: Client,
  tenant: TenantScope,
  values: ParkingSpotValues = {},
): Promise<string> {
  const id = randomUUID();
  const {
    code = `SPOT-${randomUUID()}`,
    label = "Parking Spot",
    status,
  } = values;
  const columns = [
    "id",
    "organization_id",
    "location_id",
    "code",
    "label",
    ...(status === undefined ? [] : ["status"]),
    "updated_at",
  ];
  const valuesList = [
    id,
    tenant.organizationId,
    tenant.locationId,
    code,
    label,
    ...(status === undefined ? [] : [status]),
    new Date(),
  ];
  await client.query(
    `INSERT INTO parking_spots (${columns.join(", ")})
     VALUES (${valuesList.map((_, index) => `$${index + 1}`).join(", ")})`,
    valuesList,
  );
  return id;
}

export async function ensureParkingSpotZone(
  client: Client,
  parkingSpotId: string,
): Promise<string | null> {
  const spot = await client.query<{
    location_id: string;
    organization_id: string;
    parking_zone_id: string | null;
  }>(
    `SELECT organization_id, location_id, parking_zone_id
     FROM parking_spots WHERE id = $1`,
    [parkingSpotId],
  );
  const row = spot.rows[0];
  if (row === undefined) return null;
  if (row.parking_zone_id !== null) return row.parking_zone_id;
  const zoneId = randomUUID();
  await client.query(
    `INSERT INTO parking_zones
       (id, organization_id, location_id, code, label, updated_at)
     VALUES ($1, $2, $3, $4, 'Test Zone', CURRENT_TIMESTAMP)`,
    [zoneId, row.organization_id, row.location_id, randomUUID()],
  );
  await client.query(
    `UPDATE parking_spots SET parking_zone_id = $1 WHERE id = $2`,
    [zoneId, parkingSpotId],
  );
  return zoneId;
}
