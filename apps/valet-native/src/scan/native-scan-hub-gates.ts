import type {
  EmployeeOperationalScope,
  EmployeeParkingStartSnapshot,
  EmployeeRetrievalSnapshot,
} from "@valet/employee-client";

import type { ProductionDestination } from "../shell/production-shell-controller";

export type NativeScanHubTile =
  "keySlot" | "licensePlate" | "parkingSpot" | "pickupHandoff";

export type NativeScanHubDisabledReason =
  "keySlotDisabled" | "parkingDisabled" | "retrievalDisabled";

export interface NativeScanHubGate<T = null> {
  readonly available: boolean;
  readonly context: T | null;
  readonly disabledReason: NativeScanHubDisabledReason | null;
}

export interface NativeScanHubGates {
  readonly keySlot: NativeScanHubGate;
  readonly licensePlate: NativeScanHubGate;
  readonly parkingSpot: NativeScanHubGate<EmployeeParkingStartSnapshot>;
  readonly pickupHandoff: NativeScanHubGate<EmployeeRetrievalSnapshot>;
}

interface CurrentAuthority {
  readonly identityGeneration: number;
  readonly scope: EmployeeOperationalScope;
}

const retrievalResumePhases = new Set<EmployeeRetrievalSnapshot["phase"]>([
  "key-checkout",
  "ready",
  "retrieving",
  "submitting-ready",
  "submitting-start",
]);

export function licensePlateGate(): NativeScanHubGate {
  return { available: true, context: null, disabledReason: null };
}

export function keySlotGate(): NativeScanHubGate {
  return {
    available: false,
    context: null,
    disabledReason: "keySlotDisabled",
  };
}

export function parkingSpotGate(
  snapshot: EmployeeParkingStartSnapshot,
  authority: CurrentAuthority,
): NativeScanHubGate<EmployeeParkingStartSnapshot> {
  const available =
    snapshot.phase === "started" &&
    hasCurrentTarget(snapshot, authority) &&
    snapshot.task?.taskType === "PARKING" &&
    snapshot.task.status === "IN_PROGRESS" &&
    snapshot.task.currentAssigneeMembershipId ===
      authority.scope.membershipId &&
    snapshot.session?.state === "PARKING";
  return {
    available,
    context: available ? snapshot : null,
    disabledReason: available ? null : "parkingDisabled",
  };
}

export function pickupHandoffGate(
  snapshot: EmployeeRetrievalSnapshot,
  authority: CurrentAuthority,
): NativeScanHubGate<EmployeeRetrievalSnapshot> {
  const available =
    retrievalResumePhases.has(snapshot.phase) &&
    hasCurrentTarget(snapshot, authority) &&
    snapshot.task?.taskType === "RETRIEVAL" &&
    (snapshot.task.status === "ACCEPTED" ||
      snapshot.task.status === "IN_PROGRESS") &&
    snapshot.task.currentAssigneeMembershipId === authority.scope.membershipId;
  return {
    available,
    context: available ? snapshot : null,
    disabledReason: available ? null : "retrievalDisabled",
  };
}

export function deriveNativeScanHubGates(input: {
  readonly identityGeneration: number;
  readonly parking: EmployeeParkingStartSnapshot;
  readonly retrieval: EmployeeRetrievalSnapshot;
  readonly scope: EmployeeOperationalScope;
}): NativeScanHubGates {
  const authority = {
    identityGeneration: input.identityGeneration,
    scope: input.scope,
  };
  return {
    keySlot: keySlotGate(),
    licensePlate: licensePlateGate(),
    parkingSpot: parkingSpotGate(input.parking, authority),
    pickupHandoff: pickupHandoffGate(input.retrieval, authority),
  };
}

export function scanHubLaunchTarget(
  tile: NativeScanHubTile,
  gates: NativeScanHubGates,
): ProductionDestination | null {
  if (tile === "licensePlate") return "check-in";
  if (tile === "parkingSpot" && gates.parkingSpot.available) return "parking";
  if (tile === "pickupHandoff" && gates.pickupHandoff.available)
    return "retrieval";
  return null;
}

export function launchNativeScanHubTile(
  tile: NativeScanHubTile,
  gates: NativeScanHubGates,
  navigate: (destination: ProductionDestination) => void,
): boolean {
  const destination = scanHubLaunchTarget(tile, gates);
  if (destination === null) return false;
  navigate(destination);
  return true;
}

function hasCurrentTarget(
  snapshot: EmployeeParkingStartSnapshot | EmployeeRetrievalSnapshot,
  authority: CurrentAuthority,
): boolean {
  return (
    snapshot.identityGeneration === authority.identityGeneration &&
    snapshot.scope !== null &&
    sameScope(snapshot.scope, authority.scope) &&
    snapshot.session !== null &&
    snapshot.task !== null &&
    snapshot.task.sessionId === snapshot.session.sessionId &&
    snapshot.session.locationId === authority.scope.locationId &&
    snapshot.task.valetSessionState === snapshot.session.state &&
    snapshot.task.valetSessionVersion === snapshot.session.version
  );
}

function sameScope(
  left: EmployeeOperationalScope,
  right: EmployeeOperationalScope,
): boolean {
  return (
    left.membershipId === right.membershipId &&
    left.organizationId === right.organizationId &&
    left.locationId === right.locationId &&
    left.shiftId === right.shiftId &&
    left.role === right.role
  );
}
