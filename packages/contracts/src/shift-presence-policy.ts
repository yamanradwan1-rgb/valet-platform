import { z } from "zod";

export const SHIFT_PRESENCE_LIMITS = Object.freeze({
  minRadiusMeters: 5,
  maxRadiusMeters: 1000,
  maxAccuracyMeters: 200,
  maxFixAgeSeconds: 120,
  futureSkewSeconds: 5,
  challengeLifetimeSeconds: 300,
  reconciliationDays: 14,
  tombstoneDays: 90,
  challengeCleanupHours: 24,
  historyMonths: 24,
});

export const shiftPresenceModeSchema = z.enum([
  "OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE",
]);
export const shiftPresenceAccuracyThresholdSchema = z.number().int().min(1).max(200);
export const shiftPresenceAgeThresholdSchema = z.number().int().min(1).max(120);
export const shiftPresenceRevisionSchema = z.number().int().min(1).max(2_147_483_647);

const effectiveShape = {
  startMode: shiftPresenceModeSchema,
  endMode: shiftPresenceModeSchema,
  maxAccuracyMeters: shiftPresenceAccuracyThresholdSchema,
  maxFixAgeSeconds: shiftPresenceAgeThresholdSchema,
};

export const shiftPresenceEffectivePolicySchema = z.object(effectiveShape).strict();
export const shiftPresenceCompanyPolicySchema = z.object({
  ...effectiveShape,
  revision: shiftPresenceRevisionSchema,
}).strict();
export const shiftPresenceLocationPolicySchema = z.object({
  startModeOverride: shiftPresenceModeSchema.nullable(),
  endModeOverride: shiftPresenceModeSchema.nullable(),
  maxAccuracyMetersOverride: shiftPresenceAccuracyThresholdSchema.nullable(),
  maxFixAgeSecondsOverride: shiftPresenceAgeThresholdSchema.nullable(),
  revision: shiftPresenceRevisionSchema,
}).strict();

export type ShiftPresenceMode = z.infer<typeof shiftPresenceModeSchema>;
export type ShiftPresenceEffectivePolicy = z.infer<typeof shiftPresenceEffectivePolicySchema>;
export type ShiftPresenceCompanyPolicy = z.infer<typeof shiftPresenceCompanyPolicySchema>;
export type ShiftPresenceLocationPolicy = z.infer<typeof shiftPresenceLocationPolicySchema>;

export function resolveShiftPresencePolicy(
  companyInput: ShiftPresenceCompanyPolicy,
  locationInput: ShiftPresenceLocationPolicy,
) {
  const company = shiftPresenceCompanyPolicySchema.parse(companyInput);
  const location = shiftPresenceLocationPolicySchema.parse(locationInput);
  return {
    startMode: location.startModeOverride ?? company.startMode,
    endMode: location.endModeOverride ?? company.endMode,
    maxAccuracyMeters: location.maxAccuracyMetersOverride ?? company.maxAccuracyMeters,
    maxFixAgeSeconds: location.maxFixAgeSecondsOverride ?? company.maxFixAgeSeconds,
    companyRevision: company.revision,
    locationRevision: location.revision,
  };
}
