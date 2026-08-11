import { randomUUID } from "node:crypto";

import type { Client } from "pg";

export interface Phase3Scope {
  locationId: string;
  organizationId: string;
}

export async function createPhase3Spot(
  client: Client,
  scope: Phase3Scope,
  zoneId: string | null,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO parking_spots
       (id, organization_id, location_id, parking_zone_id, code, label, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Spot', transaction_timestamp())`,
    [id, scope.organizationId, scope.locationId, zoneId, randomUUID()],
  );
  return id;
}

export async function createPhase3Slot(
  client: Client,
  scope: Phase3Scope,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO key_slots (id, organization_id, location_id, code, updated_at)
     VALUES ($1, $2, $3, $4, transaction_timestamp())`,
    [id, scope.organizationId, scope.locationId, randomUUID()],
  );
  return id;
}
