import type {
  ConditionPhotoStateDiscovery,
  ConditionPhotoUploadStatus,
} from "@valet/contracts";
import { EmployeeConditionPhotoGallery, type ConditionPhotoSlot } from
  "./employee-condition-photo-gallery";

export interface ConditionPhotoScope {
  readonly authGeneration: number;
  readonly identityGeneration: number;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly workflowOwner: string;
}

export type ConditionPhotoPhase =
  | "loading" | "available" | "captured" | "uploading"
  | "unknown" | "pending" | "verified" | "rejected" | "unavailable";

export interface ConditionPhotoSnapshot {
  /** Monotonic owner revision prevents same-account A→B→A callback acceptance. */
  readonly ownerRevision: number;
  readonly scope: ConditionPhotoScope | null;
  readonly phase: ConditionPhotoPhase;
  readonly required: boolean | null;
  readonly qualifying: boolean;
  readonly captureRevision: number;
  readonly status: ConditionPhotoUploadStatus | null;
  readonly error: "CAMERA" | "FILE" | "NETWORK" | "RESPONSE" | null;
  readonly hasCapture: boolean;
  readonly slots: readonly ConditionPhotoSlot[];
  readonly capturedCount: number;
  readonly uploadedCount: number;
  readonly verifiedTotal: number;
}

export function initialConditionPhotoSnapshot(): ConditionPhotoSnapshot {
  return {
    scope: null, ownerRevision: 0, phase: "loading", required: null, qualifying: false,
    captureRevision: 0, status: null, error: null, hasCapture: false,
    ...new EmployeeConditionPhotoGallery().snapshot,
  };
}

export function conditionPhotoScopeKey(scope: ConditionPhotoScope): string {
  return JSON.stringify([
    scope.authGeneration, scope.identityGeneration,
    scope.membershipId, scope.organizationId, scope.locationId,
    scope.sessionId, scope.workflowOwner,
  ]);
}

export function discoveredPhotoState(
  old: ConditionPhotoSnapshot,
  discovery: ConditionPhotoStateDiscovery,
): ConditionPhotoSnapshot {
  const status = discovery.pendingOperation ?? discovery.latestOperation;
  return {
    ...old,
    required: discovery.photoPolicy.required,
    qualifying: discovery.qualifyingPhotoPresent,
    status,
    phase: discovery.qualifyingPhotoPresent ? "verified"
      : status?.status === "PENDING" ? "pending"
      : status?.status === "REJECTED" || status?.status === "EXPIRED"
        ? "rejected" : old.hasCapture ? "captured" : "available",
    error: null,
  };
}
