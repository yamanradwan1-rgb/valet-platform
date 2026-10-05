import { EmployeeApiError } from "./api-error";
import type {
  PresenceChallenge,
  PresenceDescriptor,
  PresenceException,
  PresenceSnapshot,
  PresenceTransport,
  PresenceStore,
  PresenceTarget,
  PresenceResult,
} from "./employee-shift-presence-types";

export interface PresenceAttempt {
  readonly generation: number;
  descriptor: PresenceDescriptor;
  readonly controller: AbortController;
  challenge: PresenceChallenge | undefined;
  exception: PresenceException | undefined;
  sent: boolean;
  exceptionSent: boolean;
  terminal: boolean;
  result?: PresenceResult;
}

export interface PresenceWorkflow {
  readonly transport: PresenceTransport;
  readonly store: PresenceStore;
  current(attempt: PresenceAttempt): boolean;
  available(): boolean;
  publish(patch: Partial<PresenceSnapshot>): void;
  snapshot(): PresenceSnapshot;
}

export function presenceFailure(
  code = "PRESENCE_RESULT_UNKNOWN",
  status = 503,
): EmployeeApiError {
  return new EmployeeApiError({
    code,
    message: "The Shift presence result is not confirmed.",
    status,
  });
}

export function assertCurrent(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
): void {
  if (!workflow.current(attempt))
    throw !workflow.available() && (attempt.sent || attempt.exceptionSent)
      ? presenceFailure()
      : presenceFailure("PRESENCE_RETIRED", 409);
}

export function assertAvailable(workflow: PresenceWorkflow): void {
  if (!workflow.available()) throw presenceFailure();
}

export async function persistPresenceDispatch(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
  stage: "SHIFT_MAY_HAVE_LEFT" | "EXCEPTION_MAY_HAVE_LEFT",
): Promise<void> {
  assertCurrent(workflow, attempt);
  assertAvailable(workflow);
  const descriptor = { ...attempt.descriptor, stage };
  await workflow.store.write(descriptor);
  assertCurrent(workflow, attempt);
  assertAvailable(workflow);
  attempt.descriptor = descriptor;
}

export function verifyChallenge(
  challenge: PresenceChallenge,
  descriptor: PresenceDescriptor,
): void {
  const target = descriptor.target;
  if (
    challenge.operationId !== descriptor.operationId ||
    challenge.action !== target.action ||
    challenge.locationId !== target.locationId ||
    challenge.shiftId !== target.shiftId
  )
    throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
}

export function verifyException(
  exception: PresenceException,
  target: PresenceTarget,
): void {
  if (
    exception.action !== target.action ||
    exception.locationId !== target.locationId ||
    exception.shiftId !== target.shiftId
  )
    throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
}

export function emptyPresenceSnapshot(): PresenceSnapshot {
  return {
    phase: "idle",
    mode: null,
    reason: null,
    summary: null,
    overrideReason: null,
    retryAfter: null,
  };
}
