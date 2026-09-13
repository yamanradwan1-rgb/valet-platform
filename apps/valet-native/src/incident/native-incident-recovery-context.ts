import {
  parseIncidentRecoveryMarker,
  parseInstallationAuthState,
  type IncidentRecoveryContext,
  type IncidentRecoveryStore,
  type InstallationAuthStateStore,
  type StaffOperationalContextResponse,
} from "@valet/employee-client";

import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";

function recordRecoveryInvalidated(): void {
  // Fail-open via the owner; classification is from the closed vocabulary.
  getNativeTelemetry().record({
    classification: "invalidated",
    outcome: "error",
    source: "recovery",
  });
}

export async function resolveNativeIncidentRecoveryContext(
  response: StaffOperationalContextResponse,
  store: IncidentRecoveryStore,
  installationStore: InstallationAuthStateStore,
): Promise<IncidentRecoveryContext | "invalidated" | null> {
  const marker = parseIncidentRecoveryMarker(await store.read());
  const installation = parseInstallationAuthState(
    await installationStore.read(),
  );
  if (installation === undefined || installation.restoreBlocked) {
    if (marker !== undefined) recordRecoveryInvalidated();
    return marker === undefined ? null : "invalidated";
  }
  if (marker !== undefined) {
    const matching = response.contexts.find(
      (context) =>
        context.membershipId === marker.membershipId &&
        context.organization.organizationId === marker.organizationId &&
        context.eligibleLocations.some(
          (location) => location.locationId === marker.locationId,
        ),
    );
    if (matching === undefined) {
      recordRecoveryInvalidated();
      return "invalidated";
    }
    return {
      installationGeneration: installation.generation,
      locationId: marker.locationId,
      membershipId: matching.membershipId,
      organizationId: matching.organization.organizationId,
    };
  }
  const active = response.contexts.find(
    (context) =>
      context.activeShift !== null && context.currentLocation !== null,
  );
  return active?.currentLocation === null || active === undefined
    ? null
    : {
        installationGeneration: installation.generation,
        locationId: active.currentLocation.locationId,
        membershipId: active.membershipId,
        organizationId: active.organization.organizationId,
      };
}
