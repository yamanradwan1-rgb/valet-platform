import { createHash } from "node:crypto";

import {
  resolveShiftPresencePolicy,
  type ShiftPresenceMode,
  type ShiftPresenceZone,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import { ShiftPresenceError } from "./shift-presence-errors";

interface PolicyRow {
  start_mode: ShiftPresenceMode;
  end_mode: ShiftPresenceMode;
  accuracy: number;
  age: number;
  company_revision: number;
  start_override: ShiftPresenceMode | null;
  end_override: ShiftPresenceMode | null;
  accuracy_override: number | null;
  age_override: number | null;
  location_revision: number;
}

/** Call before existing command row locks; caller retains transaction through write. */
export async function lockShiftPresenceConfiguration(
  transaction: PostgresTransaction,
  scope: { readonly organizationId: string; readonly locationId: string },
) {
  await lockManagementSettingsOrganization(
    transaction,
    scope.organizationId,
    "SHARED",
  );
  await lockLocationLifecycle(transaction, scope.locationId, "SHARED");
  return readGuardedShiftPresenceConfiguration(transaction, scope);
}

/** Settings/lifecycle guards must already be held, before authority/attempt locks. */
export async function readGuardedShiftPresenceConfiguration(
  transaction: PostgresTransaction,
  scope: { readonly organizationId: string; readonly locationId: string },
) {
  const state = await transaction.query<PolicyRow>(
    `SELECT o.shift_start_presence_mode AS start_mode, o.shift_end_presence_mode AS end_mode,
       o.shift_presence_max_accuracy_meters AS accuracy, o.shift_presence_max_fix_age_seconds AS age,
       o.shift_presence_revision AS company_revision,
       l.shift_start_presence_mode_override AS start_override, l.shift_end_presence_mode_override AS end_override,
       l.shift_presence_max_accuracy_meters_override AS accuracy_override,
       l.shift_presence_max_fix_age_seconds_override AS age_override, l.shift_presence_revision AS location_revision
     FROM locations l JOIN organizations o ON o.id=l.organization_id
     WHERE o.id=$1 AND l.id=$2 FOR SHARE OF o,l`,
    [scope.organizationId, scope.locationId],
  );
  const row = state.rows[0];
  if (row === undefined)
    throw new ShiftPresenceError("PRESENCE_SCOPE_MISMATCH");
  const resolved = resolveShiftPresencePolicy(
    {
      startMode: row.start_mode,
      endMode: row.end_mode,
      maxAccuracyMeters: row.accuracy,
      maxFixAgeSeconds: row.age,
      revision: row.company_revision,
    },
    {
      startModeOverride: row.start_override,
      endModeOverride: row.end_override,
      maxAccuracyMetersOverride: row.accuracy_override,
      maxFixAgeSecondsOverride: row.age_override,
      revision: row.location_revision,
    },
  );
  const zones = await transaction.query<ShiftPresenceZone>(
    `SELECT id::text, organization_id::text AS "organizationId", location_id::text AS "locationId",
       code,label,latitude,longitude,radius_meters AS "radiusMeters",state,revision
     FROM shift_presence_zones WHERE organization_id=$1 AND location_id=$2 AND state='ACTIVE' ORDER BY id`,
    [scope.organizationId, scope.locationId],
  );
  const { companyRevision, locationRevision, ...policy } = resolved;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        "shift-presence-policy:v1",
        scope.organizationId,
        scope.locationId,
        policy,
        companyRevision,
        locationRevision,
        zones.rows.map((zone) => [zone.id, zone.revision]),
      ]),
    )
    .digest("hex");
  return {
    policy,
    zones: zones.rows,
    fingerprint,
    companyRevision,
    locationRevision,
  };
}

export function presenceActionPolicy(
  configuration: Awaited<
    ReturnType<typeof readGuardedShiftPresenceConfiguration>
  >,
  action: "START" | "END",
) {
  return {
    mode:
      action === "START"
        ? configuration.policy.startMode
        : configuration.policy.endMode,
    maxAccuracyMeters: configuration.policy.maxAccuracyMeters,
    maxFixAgeSeconds: configuration.policy.maxFixAgeSeconds,
  };
}
