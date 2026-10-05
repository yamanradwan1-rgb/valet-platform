import {
  shiftPresenceEvidenceSchema,
  type ShiftPresenceEvidence,
} from "@valet/contracts";
import { EmployeeApiError } from "./api-error";
import {
  presenceIntent,
  type PresenceAcquisition,
} from "./employee-shift-presence-types";
import {
  assertCurrent,
  assertAvailable,
  presenceFailure,
  verifyChallenge,
  type PresenceAttempt,
  type PresenceWorkflow,
} from "./employee-shift-presence-workflow";

export async function acquirePresenceEvidence(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
  acquisition: PresenceAcquisition,
  createId: () => string,
): Promise<ShiftPresenceEvidence | undefined> {
  if (
    workflow.snapshot().phase === "approved" &&
    attempt.exception !== undefined &&
    attempt.challenge !== undefined
  ) {
    return shiftPresenceEvidenceSchema.parse({
      kind: "EXCEPTION",
      operationId: attempt.descriptor.operationId,
      challengeId: attempt.challenge.challengeId,
      exceptionId: attempt.exception.exceptionId,
    });
  }
  workflow.publish({ phase: "discovering" });
  await workflow.store.write(attempt.descriptor);
  assertCurrent(workflow, attempt);
  assertAvailable(workflow);
  const challenge = await workflow.transport.challenge(
    presenceIntent(attempt.descriptor.target, attempt.descriptor.operationId),
  );
  assertCurrent(workflow, attempt);
  assertAvailable(workflow);
  verifyChallenge(challenge, attempt.descriptor);
  attempt.challenge = challenge;
  workflow.publish({ mode: challenge.presence.mode });
  if (challenge.presence.mode === "OFF") return undefined;
  workflow.publish({ phase: "acquiring" });
  try {
    const measurement = await acquisition.acquire(
      challenge,
      attempt.controller.signal,
    );
    assertCurrent(workflow, attempt);
    return shiftPresenceEvidenceSchema.parse({
      kind: "MEASURED",
      operationId: attempt.descriptor.operationId,
      challengeId: challenge.challengeId,
      clientSampleId: createId(),
      measurement,
    });
  } catch (error) {
    assertCurrent(workflow, attempt);
    if (challenge.presence.mode === "WARN_ONLY") return undefined;
    const permission =
      error instanceof EmployeeApiError &&
      error.code === "LOCATION_UNAVAILABLE";
    workflow.publish({
      phase: "unavailable",
      reason:
        error instanceof EmployeeApiError ? error.code : "GPS_UNAVAILABLE",
      overrideReason:
        challenge.presence.mode === "REQUIRE_OR_OVERRIDE"
          ? permission
            ? "LOCATION_UNAVAILABLE"
            : "GPS_UNAVAILABLE"
          : null,
    });
    throw presenceFailure("GPS_UNAVAILABLE", 422);
  }
}
