import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import { isAmbiguousMutationFailure } from "./employee-operational-recovery";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import type {
  EmployeeRetrievalPhase,
  EmployeeRetrievalSnapshot,
  EmployeeRetrievalTransport,
} from "./employee-retrieval-flow-types";
import type { QrResourcePayload } from "./qr-resource-payload";

/**
 * Canonical reconciliation for the Retrieval workflow (MOB-013).
 *
 * Every phase is derived exclusively from the authoritative session detail
 * and exact-Location task queue projections under the accepted current
 * contracts. The server owns both physical transitions (start-retrieval,
 * mark-ready); this module never invents authority.
 */

export interface EmployeeRetrievalTarget {
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly shiftId: string;
  taskId: string;
}

/** Stable conflict codes mapped from the existing retrieval command errors. */
export const retrievalConflictCodes: ReadonlySet<string> = new Set([
  "INVALID_STATE_TRANSITION",
  "KEY_CUSTODY_NOT_READY",
  "RETRIEVAL_REQUEST_NOT_READY",
  "TASK_INVALID_STATE",
  "TASK_NOT_FOUND_OR_FORBIDDEN",
  "VERSION_CONFLICT",
]);

export function emptyRetrievalSnapshot(
  identityGeneration: number | null = null,
  scope: EmployeeOperationalScope | null = null,
  phase: EmployeeRetrievalPhase = "inactive",
): EmployeeRetrievalSnapshot {
  return {
    failure: null,
    identityGeneration,
    keyConfirmed: false,
    keySlotCandidate: "",
    keySlotResourceId: null,
    phase,
    readyAt: null,
    retrievalStartedAt: null,
    scope,
    session: null,
    task: null,
  };
}

export function retrievalReadFailurePhase(
  previous: EmployeeRetrievalPhase,
): "ambiguous" | "conflict" | "unavailable" {
  if (previous === "ambiguous") return "ambiguous";
  return previous === "conflict" ? "conflict" : "unavailable";
}

export function isRetrievalSubmitting(phase: EmployeeRetrievalPhase): boolean {
  return phase === "submitting-start" || phase === "submitting-ready";
}

export function findRetrievalTask(
  queue: TaskQueueResponse,
  target: EmployeeRetrievalTarget,
): StaffTaskQueueItem | undefined {
  return queue.tasks.find(
    (item) =>
      item.taskType === "RETRIEVAL" &&
      item.sessionId === target.sessionId &&
      (target.taskId === "" || item.taskId === target.taskId),
  );
}

export function isRetrievalTargetCurrent(
  snapshot: EmployeeRetrievalSnapshot,
  target: EmployeeRetrievalTarget,
): boolean {
  return (
    snapshot.identityGeneration === target.identityGeneration &&
    snapshot.scope?.organizationId === target.organizationId &&
    snapshot.scope.membershipId === target.membershipId &&
    snapshot.scope.locationId === target.locationId &&
    snapshot.scope.shiftId === target.shiftId
  );
}

export function isRetrievalKeyMatch(
  expectedKeySlotCode: string | null,
  candidate: string,
): boolean {
  // DEC-067: trim-only, byte-exact match against the projected expected Key
  // Slot code. A client match is NOT custody authority; the
  // protected start-retrieval command re-validates canonical key/custody.
  const expected = expectedKeySlotCode?.trim() ?? "";
  return expected !== "" && candidate.trim() === expected;
}

export function isRetrievalV2KeyMatch(
  session: StaffValetSessionDetailResponse,
  candidateCode: string,
  candidateId: string,
): boolean {
  return (
    session.keySlot !== null &&
    session.keySlot.keySlotId === candidateId &&
    isRetrievalKeyMatch(session.keySlot.code, candidateCode)
  );
}

export function withRetrievalKeyCandidate(
  snapshot: EmployeeRetrievalSnapshot,
  code: string,
  resourceId: string | null,
): EmployeeRetrievalSnapshot {
  return {
    ...snapshot,
    failure: null,
    keyConfirmed: false,
    keySlotCandidate: code,
    keySlotResourceId: resourceId,
  };
}

export function retrievalKeyCandidateMatches(
  snapshot: EmployeeRetrievalSnapshot,
): boolean {
  const session = snapshot.session;
  if (session === null) return false;
  return snapshot.keySlotResourceId === null
    ? isRetrievalKeyMatch(session.keySlot?.code ?? null, snapshot.keySlotCandidate)
    : isRetrievalV2KeyMatch(
        session,
        snapshot.keySlotCandidate,
        snapshot.keySlotResourceId,
      );
}

export function retrievalV2ScanAccepted(
  snapshot: EmployeeRetrievalSnapshot,
  candidate: QrResourcePayload,
): boolean {
  return (
    candidate.kind === "key-slot" &&
    snapshot.phase === "key-checkout" &&
    snapshot.session !== null
  );
}

export function retrievalScannedKeyInput(snapshot: EmployeeRetrievalSnapshot) {
  return snapshot.keySlotResourceId === null
    ? undefined
    : {
        keySlotCode: snapshot.keySlotCandidate,
        keySlotId: snapshot.keySlotResourceId,
      };
}

export function classifyRetrievalCanonical(
  target: EmployeeRetrievalTarget,
  task: StaffTaskQueueItem | undefined,
  session: StaffValetSessionDetailResponse,
): EmployeeRetrievalPhase {
  const ownedByOther =
    task !== undefined &&
    task.currentAssigneeMembershipId !== target.membershipId;
  if (
    session.sessionId !== target.sessionId ||
    task?.sessionId !== target.sessionId ||
    session.locationId !== target.locationId ||
    task?.valetSessionState !== session.state ||
    task?.valetSessionVersion !== session.version ||
    ownedByOther ||
    task === undefined
  ) {
    return "conflict";
  }
  if (
    session.state === "READY" &&
    task.status === "IN_PROGRESS" &&
    session.parking.parkedAt !== null &&
    session.keySlot !== null
  ) {
    return "ready";
  }
  if (
    session.state === "RETRIEVING" &&
    task.status === "IN_PROGRESS" &&
    session.parking.parkedAt !== null &&
    session.keySlot !== null
  ) {
    return "retrieving";
  }
  if (
    session.state === "REQUESTED" &&
    task.status === "ACCEPTED" &&
    session.parking.parkedAt !== null &&
    session.parking.parkingSpotCode !== null &&
    session.keySlot !== null
  ) {
    return "key-checkout";
  }
  if (task.status === "QUEUED" || task.status === "ASSIGNED") {
    return ownedByOther ? "conflict" : "assigned";
  }
  return "conflict";
}

export function classifyRetrievalFailure(
  error: unknown,
): "ambiguous" | "conflict" | "unavailable" {
  // DEC-063: a network timeout/ambiguous failure does not prove the server
  // failed, so it must resolve through an authoritative reread, never a
  // blind replay. Stable command conflicts surface explicitly instead.
  if (isAmbiguousMutationFailure(error)) return "ambiguous";
  if (
    error instanceof EmployeeApiError &&
    retrievalConflictCodes.has(error.code)
  ) {
    return "conflict";
  }
  return "unavailable";
}

export async function loadRetrievalCanonical(
  transport: EmployeeRetrievalTransport,
  snapshot: EmployeeRetrievalSnapshot,
  target: EmployeeRetrievalTarget,
  previous: EmployeeRetrievalPhase,
): Promise<EmployeeRetrievalSnapshot> {
  const [queue, session] = await Promise.all([
    transport.loadTaskQueue(target.locationId),
    transport.loadSession(target.sessionId),
  ]);
  const task = findRetrievalTask(queue, target);
  const phase = classifyRetrievalCanonical(target, task, session);
  const retainKeyConfirmation =
    phase === "key-checkout" &&
    ["key-checkout", "submitting-start", "reconciling"].includes(previous) &&
    (snapshot.keySlotResourceId === null
      ? isRetrievalKeyMatch(
          session.keySlot?.code ?? null,
          snapshot.keySlotCandidate,
        )
      : isRetrievalV2KeyMatch(
          session,
          snapshot.keySlotCandidate,
          snapshot.keySlotResourceId,
        ));
  return {
    ...snapshot,
    failure: null,
    keyConfirmed: retainKeyConfirmation,
    keySlotCandidate:
      retainKeyConfirmation || phase === "key-checkout"
        ? snapshot.keySlotCandidate
        : "",
    keySlotResourceId:
      retainKeyConfirmation || phase === "key-checkout"
        ? snapshot.keySlotResourceId
        : null,
    phase,
    session,
    task: task ?? null,
  };
}
