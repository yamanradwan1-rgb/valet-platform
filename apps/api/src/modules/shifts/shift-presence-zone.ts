import { shiftPresenceZoneSchema, type ShiftPresenceZone } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import { ShiftPresenceError } from "./shift-presence-errors";

async function lockZoneConfiguration(transaction: PostgresTransaction, zone: ShiftPresenceZone) {
  await lockManagementSettingsOrganization(transaction, zone.organizationId, "EXCLUSIVE");
  await lockLocationLifecycle(transaction, zone.locationId, "SHARED");
}

/** Internal persistence only. GPS-B must supply freshly authorized persisted CA/exact-LM scope. */
export async function createPresenceZone(transaction: PostgresTransaction, input: ShiftPresenceZone) {
  const zone = shiftPresenceZoneSchema.parse(input);
  if (zone.revision !== 1) throw new ShiftPresenceError("PRESENCE_CAS_CONFLICT");
  await lockZoneConfiguration(transaction, zone);
  await transaction.query(
    `INSERT INTO shift_presence_zones (id,organization_id,location_id,code,label,latitude,longitude,radius_meters,state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [zone.id, zone.organizationId, zone.locationId, zone.code, zone.label, zone.latitude, zone.longitude, zone.radiusMeters, zone.state],
  );
}

export async function updatePresenceZone(transaction: PostgresTransaction, input: ShiftPresenceZone) {
  const zone = shiftPresenceZoneSchema.parse(input);
  await lockZoneConfiguration(transaction, zone);
  const result = await transaction.query<{ revision: number }>(
    `UPDATE shift_presence_zones SET code=$4,label=$5,latitude=$6,longitude=$7,radius_meters=$8,state=$9,revision=revision+1
     WHERE organization_id=$1 AND location_id=$2 AND id=$3 AND revision=$10 RETURNING revision`,
    [zone.organizationId, zone.locationId, zone.id, zone.code, zone.label, zone.latitude, zone.longitude, zone.radiusMeters, zone.state, zone.revision],
  );
  if (result.rowCount !== 1) throw new ShiftPresenceError("PRESENCE_CAS_CONFLICT");
  return result.rows[0]!.revision;
}
