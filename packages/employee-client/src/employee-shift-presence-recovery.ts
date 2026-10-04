import { shiftPresenceMeasuredDenialExceptionReason } from "@valet/contracts";
import type {
  PresenceResult,
  PresenceReason,
} from "./employee-shift-presence-types";
import { presenceIntent } from "./employee-shift-presence-types";
import {
  assertCurrent,
  presenceFailure,
  verifyChallenge,
  verifyException,
  type PresenceAttempt,
  type PresenceWorkflow,
} from "./employee-shift-presence-workflow";

export async function recoverPresence(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
): Promise<PresenceResult> {
  const { operationId, target } = attempt.descriptor;
  const status = await workflow.transport.recover(operationId);
  assertCurrent(workflow, attempt);
  if (status.operationId !== operationId)
    throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
  if (status.state === "RECOVERABLE") {
    if (
      status.action !== target.action ||
      (target.action === "END" && status.shiftId !== target.shiftId)
    )
      throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
    if (status.status === "COMMITTED" && status.result !== null) {
      if (
        status.result.locationId !== target.locationId ||
        (target.action === "END" && status.result.shiftId !== target.shiftId) ||
        (target.action === "START"
          ? status.result.status !== "ACTIVE"
          : status.result.status !== "ENDED")
      )
        throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
      attempt.terminal = true;
      attempt.result = status.result;
      await workflow.store.delete();
      assertCurrent(workflow, attempt);
      workflow.publish({
        phase: "confirmed",
        reason: null,
        overrideReason: null,
      });
      return status.result;
    }
    attempt.terminal = true;
    workflow.publish({
      phase: status.status === "DENIED" ? "denied" : "expired",
      reason: status.denialReason,
      summary: status.summary,
      overrideReason:
        status.summary === null
          ? null
          : shiftPresenceMeasuredDenialExceptionReason(status.summary),
    });
    assertCurrent(workflow, attempt);
    await workflow.store.delete();
    assertCurrent(workflow, attempt);
    throw presenceFailure(
      status.denialReason ?? "PRESENCE_OPERATION_EXPIRED",
      422,
    );
  }
  if (status.state === "EXPIRED") {
    attempt.terminal = true;
    workflow.publish({ phase: "expired", overrideReason: null });
    assertCurrent(workflow, attempt);
    await workflow.store.delete();
    assertCurrent(workflow, attempt);
    throw presenceFailure("PRESENCE_OPERATION_EXPIRED", 422);
  }
  if (status.exceptionId !== null) {
    const exception = await workflow.transport.readException(
      status.exceptionId,
    );
    assertCurrent(workflow, attempt);
    verifyException(exception, target);
    if (exception.exceptionId !== status.exceptionId)
      throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
    attempt.exception = exception;
    if (attempt.challenge === undefined) {
      const challenge = await workflow.transport.readChallenge(operationId);
      assertCurrent(workflow, attempt);
      verifyChallenge(challenge, attempt.descriptor);
      attempt.challenge = challenge;
    }
    const phase =
      exception.status === "APPROVED"
        ? "approved"
        : exception.status === "REJECTED"
          ? "rejected"
          : exception.status === "EXPIRED" || exception.status === "CONSUMED"
            ? "expired"
            : "pending";
    if (phase === "rejected" || phase === "expired") {
      attempt.terminal = true;
      await workflow.store.delete();
      assertCurrent(workflow, attempt);
    }
    workflow.publish({
      phase,
      mode: attempt.challenge.presence.mode,
      reason: exception.status,
      overrideReason: null,
    });
  } else if (!attempt.sent && !attempt.exceptionSent) {
    const challenge = await workflow.transport.readChallenge(operationId);
    assertCurrent(workflow, attempt);
    verifyChallenge(challenge, attempt.descriptor);
    attempt.challenge = challenge;
    workflow.publish({
      phase: "unavailable",
      mode: challenge.presence.mode,
      reason: "EXPLICIT_RETRY_REQUIRED",
    });
  } else workflow.publish({ phase: "uncertain" });
  throw presenceFailure();
}

export async function createPresenceException(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
  reason: PresenceReason,
): Promise<void> {
  const { operationId, target } = attempt.descriptor;
  if (attempt.challenge === undefined) {
    await workflow.store.write(attempt.descriptor);
    assertCurrent(workflow, attempt);
    const allocated = await workflow.transport.challenge(
      presenceIntent(target, operationId),
    );
    assertCurrent(workflow, attempt);
    verifyChallenge(allocated, attempt.descriptor);
    attempt.challenge = allocated;
  }
  // Re-read guidance immediately before the employee's explicit manager choice.
  const challenge = await workflow.transport.readChallenge(operationId);
  assertCurrent(workflow, attempt);
  verifyChallenge(challenge, attempt.descriptor);
  attempt.challenge = challenge;
  if (challenge.presence.mode !== "REQUIRE_OR_OVERRIDE") {
    workflow.publish({ mode: challenge.presence.mode, overrideReason: null });
    throw presenceFailure("PRESENCE_REQUIRED", 422);
  }
  attempt.exceptionSent = true;
  workflow.publish({ phase: "submitting", mode: challenge.presence.mode });
  const exception = await workflow.transport.requestException(
    operationId,
    challenge.challengeId,
    reason,
  );
  assertCurrent(workflow, attempt);
  verifyException(exception, target);
  attempt.exception = exception;
  workflow.publish({ phase: "pending", reason: exception.status });
}
