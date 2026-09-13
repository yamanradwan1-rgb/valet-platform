import {
  parseIncidentRecoveryMarker,
  parseInstallationAuthState,
  type IncidentRecoveryContext,
  type IncidentRecoveryStore,
  type InstallationAuthStateStore,
  type StaffOperationalContextResponse,
} from "@valet/employee-client";

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
    return matching === undefined
      ? "invalidated"
      : {
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
