import type { ConditionPhotoTransport } from "./employee-condition-photo-transport";
import type { ConditionPhotoScope, ConditionPhotoSnapshot } from
  "./employee-condition-photo-state";
import { discoveredPhotoState } from "./employee-condition-photo-state";
import type { EmployeeConditionPhotoGallery } from "./employee-condition-photo-gallery";

/** Do not let latest VERIFIED A replace an unresolved newer operation B. */
export async function discoverConditionPhotoGallery(
  transport: ConditionPhotoTransport,
  scope: ConditionPhotoScope,
  previous: ConditionPhotoSnapshot,
  unresolvedOperationId: string | null,
  gallery: EmployeeConditionPhotoGallery,
  signal: AbortSignal,
  current: () => boolean,
) {
  const discovery = await transport.discover(scope.sessionId, signal);
  if (!current()) return null;
  const unresolved = (previous.phase === "unknown" || previous.phase === "pending") &&
    unresolvedOperationId !== null &&
    discovery.pendingOperation?.operationId !== unresolvedOperationId &&
    discovery.latestOperation?.operationId !== unresolvedOperationId;
  let snapshot = unresolved ? {
    ...previous, required: discovery.photoPolicy.required,
    qualifying: discovery.qualifyingPhotoPresent,
  } : discoveredPhotoState(previous, discovery);
  const operationId = unresolved ? unresolvedOperationId :
    discovery.pendingOperation?.operationId ??
    discovery.latestOperation?.operationId ?? null;
  if (!transport.summary) return { snapshot, operationId,
    obsolete: [] as string[], verifiedSources: [] as string[] };
  const summary = await transport.summary(scope.sessionId, signal);
  if (!current()) return null;
  if (summary.valetSessionId !== scope.sessionId)
    throw new Error("Condition photo summary scope mismatch.");
  const { discardedThumbs, verifiedSources } = gallery.recover(summary);
  if (!unresolved && gallery.uploadCandidate() &&
      snapshot.phase !== "pending")
    snapshot = { ...snapshot, phase: "captured", hasCapture: true };
  return { snapshot, operationId, obsolete: discardedThumbs, verifiedSources };
}
