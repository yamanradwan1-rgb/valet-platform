import {
  shiftPresenceCompanyPolicySchema,
  shiftPresenceLocationPolicySchema,
  shiftPresenceZoneSchema,
  resolveShiftPresencePolicy,
  type ShiftPresenceEffectivePolicy,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftPresenceConfiguration } from "../shifts/shift-presence-policy";
import { ManagementAccessDeniedError } from "./management-authorization";

export async function presenceCompanyPolicy(
  transaction: PostgresTransaction,
  organizationId: string,
) {
  const result = await transaction.query(
    `SELECT shift_start_presence_mode AS "startMode",
    shift_end_presence_mode AS "endMode",shift_presence_max_accuracy_meters AS "maxAccuracyMeters",
    shift_presence_max_fix_age_seconds AS "maxFixAgeSeconds",shift_presence_revision AS revision
    FROM organizations WHERE id=$1`,
    [organizationId],
  );
  if (result.rows[0] === undefined) throw new ManagementAccessDeniedError();
  return shiftPresenceCompanyPolicySchema.parse(result.rows[0]);
}

export async function presenceLocationPolicy(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
) {
  const company = await presenceCompanyPolicy(transaction, organizationId);
  const location = await transaction.query(
    `SELECT timezone,
    shift_start_presence_mode_override AS "startModeOverride",shift_end_presence_mode_override AS "endModeOverride",
    shift_presence_max_accuracy_meters_override AS "maxAccuracyMetersOverride",
    shift_presence_max_fix_age_seconds_override AS "maxFixAgeSecondsOverride",shift_presence_revision AS revision
    FROM locations WHERE organization_id=$1 AND id=$2`,
    [organizationId, locationId],
  );
  const row = location.rows[0];
  if (row === undefined) throw new ManagementAccessDeniedError();
  const { timezone, ...overrideRow } = row;
  const overrides = shiftPresenceLocationPolicySchema.parse(overrideRow);
  const resolved = resolveShiftPresencePolicy(company, overrides);
  const effective = {
    startMode: resolved.startMode,
    endMode: resolved.endMode,
    maxAccuracyMeters: resolved.maxAccuracyMeters,
    maxFixAgeSeconds: resolved.maxFixAgeSeconds,
  };
  const configuration = await lockShiftPresenceConfiguration(transaction, {
    organizationId,
    locationId,
  });
  const now = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  return {
    organizationId,
    locationId,
    timezone: timezone as string,
    company,
    overrides,
    effective,
    readiness: presenceReadiness(effective, configuration.zones, {
      companyRevision: company.revision,
      locationRevision: overrides.revision,
      configurationFingerprint: configuration.fingerprint,
      observedAt: now.rows[0]!.now.toISOString(),
    }),
    capabilities: { canEdit: true, canReviewExceptions: true },
  };
}

export function presenceReadiness(
  policy: ShiftPresenceEffectivePolicy,
  zones: readonly unknown[],
  context: {
    companyRevision: number;
    locationRevision: number;
    configurationFingerprint: string;
    observedAt: string;
  },
) {
  const active = zones.flatMap((zone) => {
    const parsed = shiftPresenceZoneSchema.safeParse(zone);
    return parsed.success && parsed.data.state === "ACTIVE"
      ? [parsed.data]
      : [];
  });
  const invalid = zones.some(
    (zone) => !shiftPresenceZoneSchema.safeParse(zone).success,
  );
  const strict = [policy.startMode, policy.endMode].some(
    (mode) => mode === "REQUIRE" || mode === "REQUIRE_OR_OVERRIDE",
  );
  const warning = [policy.startMode, policy.endMode].includes("WARN_ONLY");
  const blockers: Array<
    "INVALID_PRESENCE_CONFIGURATION" | "NO_USABLE_ATTENDANCE_ZONE"
  > = [];
  if (invalid) blockers.push("INVALID_PRESENCE_CONFIGURATION");
  if (active.length === 0) blockers.push("NO_USABLE_ATTENDANCE_ZONE");
  return {
    applicability: strict
      ? ("STRICT" as const)
      : warning
        ? ("WARNING" as const)
        : ("NOT_APPLICABLE" as const),
    configurationUsable: !invalid && active.length > 0,
    strictActivationAllowed: true as const,
    activeZoneCount: active.length,
    blockers,
    ...context,
  };
}
