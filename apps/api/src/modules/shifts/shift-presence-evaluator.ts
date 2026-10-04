import {
  SHIFT_PRESENCE_LIMITS,
  shiftPresenceEffectivePolicySchema,
  shiftPresenceMeasurementSchema,
  shiftPresenceZoneSchema,
  type ShiftPresenceClassification,
  type ShiftPresenceReason,
} from "@valet/contracts";

export interface ShiftPresenceEvaluation {
  readonly classification: ShiftPresenceClassification;
  readonly reason: ShiftPresenceReason;
  readonly zoneId: string | null;
  readonly zoneRevision: number | null;
  readonly accuracyBand: "ACCEPTABLE" | "UNUSABLE" | "NOT_EVALUATED";
  readonly freshnessBand: "ACCEPTABLE" | "UNUSABLE" | "NOT_EVALUATED";
}

/** Input coordinates are transient. No distance or exact fix is returned. */
export function circularDistanceMeters(
  latitude: number, longitude: number, centerLatitude: number, centerLongitude: number,
): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (centerLatitude - latitude) * radians;
  const longitudeDelta = (centerLongitude - longitude) * radians;
  const h = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude * radians) * Math.cos(centerLatitude * radians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

function result(
  classification: ShiftPresenceClassification,
  reason: ShiftPresenceReason,
  accuracyBand: "ACCEPTABLE" | "UNUSABLE" | "NOT_EVALUATED" = "ACCEPTABLE",
  freshnessBand: "ACCEPTABLE" | "UNUSABLE" | "NOT_EVALUATED" = "ACCEPTABLE",
): ShiftPresenceEvaluation {
  return { classification, reason, zoneId: null, zoneRevision: null, accuracyBand, freshnessBand };
}

export function evaluateShiftPresence(input: {
  readonly scope: { readonly organizationId: string; readonly locationId: string };
  readonly now: Date;
  readonly measurement: unknown;
  readonly policy: unknown;
  readonly zones: readonly unknown[];
  readonly issuedAt?: Date;
}): ShiftPresenceEvaluation {
  for (const candidate of input.zones) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const scope = candidate as { organizationId?: unknown; locationId?: unknown };
    if (scope.organizationId !== input.scope.organizationId || scope.locationId !== input.scope.locationId) {
      throw new Error("PRESENCE_SCOPE_MISMATCH");
    }
  }
  const policy = shiftPresenceEffectivePolicySchema.safeParse(input.policy);
  const now = input.now.getTime();
  if (!policy.success || !Number.isFinite(now)) {
    return result("CONFIGURATION_UNUSABLE", "INVALID_CONFIGURATION", "NOT_EVALUATED", "NOT_EVALUATED");
  }
  const measurement = shiftPresenceMeasurementSchema.safeParse(input.measurement);
  if (!measurement.success) {
    return result("MEASUREMENT_UNUSABLE", "INVALID_FIX", "UNUSABLE", "UNUSABLE");
  }
  const fix = measurement.data;
  if (fix.accuracyMeters > policy.data.maxAccuracyMeters) {
    return result("MEASUREMENT_UNUSABLE", "INACCURATE_FIX", "UNUSABLE", "NOT_EVALUATED");
  }
  const captured = new Date(fix.capturedAt).getTime();
  if (input.issuedAt !== undefined && (!Number.isFinite(input.issuedAt.getTime())
    || captured < input.issuedAt.getTime() - SHIFT_PRESENCE_LIMITS.futureSkewSeconds * 1000)) {
    return result("MEASUREMENT_UNUSABLE", "INVALID_FIX", "UNUSABLE", "UNUSABLE");
  }
  if (captured > now + SHIFT_PRESENCE_LIMITS.futureSkewSeconds * 1000) {
    return result("MEASUREMENT_UNUSABLE", "FUTURE_FIX", "ACCEPTABLE", "UNUSABLE");
  }
  if (now - captured > policy.data.maxFixAgeSeconds * 1000) {
    return result("MEASUREMENT_UNUSABLE", "STALE_FIX", "ACCEPTABLE", "UNUSABLE");
  }
  const parsed = input.zones.map((zone) => shiftPresenceZoneSchema.safeParse(zone));
  if (parsed.some((zone) => !zone.success)) {
    return result("CONFIGURATION_UNUSABLE", "INVALID_CONFIGURATION");
  }
  const active = parsed.flatMap((zone) => zone.success && zone.data.state === "ACTIVE" ? [zone.data] : []);
  if (active.length === 0) return result("CONFIGURATION_UNUSABLE", "NO_ACTIVE_ZONE");
  let ambiguous = false;
  for (const zone of active) {
    const distance = circularDistanceMeters(fix.latitude, fix.longitude, zone.latitude, zone.longitude);
    if (distance + fix.accuracyMeters <= zone.radiusMeters) {
      return { ...result("CONFIDENT_INSIDE", "INSIDE"), zoneId: zone.id, zoneRevision: zone.revision };
    }
    if (distance - fix.accuracyMeters <= zone.radiusMeters) ambiguous = true;
  }
  return ambiguous ? result("AMBIGUOUS_EDGE", "EDGE") : result("CONFIDENT_OUTSIDE", "OUTSIDE");
}
