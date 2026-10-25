import {
  resolveShiftPresencePolicy,
  type ShiftPresenceZone,
} from "@valet/contracts";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import type { PresenceApi, PresenceLocation } from "./shift-presence-api";
import { LastAttendanceZoneError } from "./shift-presence-errors";

/** Matching server snapshots only; neither an unsaved policy nor a paged zone list is proof. */
export function isLastStrictAttendanceZone(
  policy: PresenceLocation,
  current: Awaited<ReturnType<PresenceApi["zone"]>>,
  input: unknown,
) {
  if (typeof input !== "object" || input === null) return false;
  const draft = input as Partial<ShiftPresenceZone> & {
    expectedRevision?: number;
  };
  const zone = current.zone;
  const ready = policy.readiness;
  const effective = resolveShiftPresencePolicy(
    policy.company,
    policy.overrides,
  );
  return (
    zone.organizationId === policy.organizationId &&
    zone.locationId === policy.locationId &&
    zone.state === "ACTIVE" &&
    draft.state === "DISABLED" &&
    draft.expectedRevision === zone.revision &&
    (["code", "label", "latitude", "longitude", "radiusMeters"] as const).every(
      (key) => draft[key] === zone[key],
    ) &&
    ready.configurationUsable &&
    ready.activeZoneCount === 1 &&
    ready.blockers.length === 0 &&
    ready.applicability === "STRICT" &&
    ready.companyRevision === policy.company.revision &&
    ready.locationRevision === policy.overrides.revision &&
    (
      ["startMode", "endMode", "maxAccuracyMeters", "maxFixAgeSeconds"] as const
    ).every((key) => effective[key] === policy.effective[key]) &&
    [effective.startMode, effective.endMode].some(
      (mode) => mode === "REQUIRE" || mode === "REQUIRE_OR_OVERRIDE",
    ) &&
    ready.configurationFingerprint ===
      current.readiness.configurationFingerprint &&
    ready.companyRevision === current.readiness.companyRevision &&
    ready.locationRevision === current.readiness.locationRevision
  );
}

export async function saveZoneWithReadinessFeedback(
  api: PresenceApi,
  id: string,
  input: unknown,
  create: boolean,
) {
  try {
    return await api.saveZone(id, input, create);
  } catch (error) {
    if (
      !create &&
      error instanceof DashboardApiError &&
      error.code === "PRESENCE_NOT_READY"
    ) {
      // Read-only diagnosis after rejection. Never replay the write or edit policy.
      try {
        const [policy, current] = await Promise.all([
          api.policy(),
          api.zone(id),
        ]);
        if (
          "effective" in policy &&
          isLastStrictAttendanceZone(policy, current, input)
        ) {
          throw new LastAttendanceZoneError(error);
        }
      } catch (diagnosis) {
        if (diagnosis instanceof LastAttendanceZoneError) throw diagnosis;
      }
    }
    throw error;
  }
}
