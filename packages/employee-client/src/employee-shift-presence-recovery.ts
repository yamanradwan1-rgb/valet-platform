import { validatePresenceResult } from "./employee-shift-presence-result";
import { shiftPresenceMeasuredDenialExceptionReason } from "@valet/contracts";
import type {
  PresenceResult,
  PresenceReason,
} from "./employee-shift-presence-types";
import { presenceIntent } from "./employee-shift-presence-types";
import {
  assertCurrent,
  assertAvailable,
  persistPresenceDispatch,
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
  assertAvailable(workflow);
  const { operationId, target } = attempt.descriptor;
  const status = await workflow.transport.recover(operationId);
  assertCurrent(workflow, attempt);
  assertAvailable(workflow);
  if (status.operationId !== operationId)
    throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
  if (status.state === "RECOVERABLE") {
    if (
      status.action !== target.action ||
      (target.action === "END" &&
        status.shiftId !== target.shiftId &&
        (status.status === "COMMITTED" || status.shiftId !== null))
    )
      throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
    // DENIED/EXPIRED have no result Shift. Their owned immutable operation ID
    // is bound to the exact local target; shiftId here is a result selector.
    if (status.status === "COMMITTED") {
      if (status.result === null)
        throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
      validatePresenceResult(target, status.result);
      attempt.terminal = true;
      attempt.result = status.result;
      await workflow.store.delete();
      assertCurrent(workflow, attempt);
      attempt.recovery = {
        status: "committed",
        descriptor: attempt.descriptor,
        result: status.result,
      };
      workflow.publish({
        phase: "confirmed",
        reason: null,
        overrideReason: null,
      });
      return status.result;
    }
    attempt.terminal = true;
    attempt.recovery = {
      status: status.status === "DENIED" ? "denied" : "expired",
      descriptor: attempt.descriptor,
      denialReason: status.denialReason,
    };
    workflow.publish({
      phase: status.status === "DENIED" ? "denied" : "expired",
      mode: null, // A's historical policy cannot authorize a new manager operation B.
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
    attempt.recovery = { status: "expired", descriptor: attempt.descriptor };
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
    if (exception.status === "CONSUMED")
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
          : exception.status === "EXPIRED"
            ? "expired"
            : "pending";
    if (phase === "rejected" || phase === "expired") {
      attempt.terminal = true;
      attempt.recovery = {
        status: phase === "rejected" ? "denied" : "expired",
        descriptor: attempt.descriptor,
        denialReason: exception.status,
      };
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
      reason: attempt.descriptor.localFailure ?? "EXPLICIT_RETRY_REQUIRED",
      overrideReason:
        challenge.presence.mode === "REQUIRE_OR_OVERRIDE"
          ? (attempt.descriptor.localFailure ?? null)
          : null,
    });
    throw presenceFailure("EXPLICIT_RETRY_REQUIRED", 422);
  } else {
    workflow.publish({ phase: "uncertain" });
    throw presenceFailure("PRESENCE_OPERATION_PENDING");
  }
  throw presenceFailure();
}

export async function createPresenceException(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
  reason: PresenceReason,
): Promise<void> {
  assertAvailable(workflow);
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
  await persistPresenceDispatch(workflow, attempt, "EXCEPTION_MAY_HAVE_LEFT");
  attempt.exceptionSent = true;
  workflow.publish({ phase: "submitting", mode: challenge.presence.mode });
  const exception = await workflow.transport.requestException(
    operationId,
    challenge.challengeId,
    reason,
  );
  assertCurrent(workflow, attempt);
  assertAvailable(workflow);
  verifyException(exception, target);
  attempt.exception = exception;
  workflow.publish({ phase: "pending", reason: exception.status });
}
