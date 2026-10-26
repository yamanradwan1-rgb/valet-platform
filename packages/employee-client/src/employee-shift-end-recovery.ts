import type { EndShiftResponse } from "@valet/contracts";
import type { EndAttempt } from "./employee-shift-end-attempt";
import {
  employeeShiftEndAuthorityKey,
  resolveEmployeeShiftEndAuthority,
  validateEmployeeShiftEndResult,
} from "./employee-shift-end-state";
import type {
  EmployeeShiftEndOutcome,
  EmployeeShiftEndSessionOptions,
} from "./employee-shift-end-types";
import { endPresenceTarget } from "./employee-shift-presence-target";
import {
  presenceTargetKey,
  type PresenceCheckOutcome,
} from "./employee-shift-presence-types";
import { operationalFailure } from "./employee-operational-recovery";
import { presenceFailure } from "./employee-shift-presence-workflow";

export async function reconcileEmployeeEndRecovery(
  options: EmployeeShiftEndSessionOptions,
  attempt: EndAttempt,
  outcome: PresenceCheckOutcome,
): Promise<EmployeeShiftEndOutcome> {
  const unresolved = {
    phase: "uncertain" as const,
    result: null,
    failure: operationalFailure(presenceFailure()),
  };
  const descriptor = outcome.descriptor;
  if (descriptor === undefined)
    return {
      ...unresolved,
      checkStatus:
        outcome.status === "committed" ? "unresolved" : outcome.status,
    };
  if (
    descriptor.operationId !== attempt.operationId ||
    descriptor.operationId !== options.presence?.descriptor()?.operationId ||
    presenceTargetKey(descriptor.target) !==
      presenceTargetKey(
        endPresenceTarget(attempt.authority, attempt.cashReported),
      )
  )
    return { ...unresolved, checkStatus: "unresolved" };
  if (outcome.status === "committed" && outcome.result !== undefined) {
    try {
      const result = outcome.result as EndShiftResponse;
      validateEmployeeShiftEndResult(
        attempt.authority,
        attempt.cashReported,
        result,
      );
      return { phase: "ended" as const, result, failure: null };
    } catch {
      return { ...unresolved, checkStatus: "unresolved" };
    }
  }
  if (!["denied", "expired", "not-sent"].includes(outcome.status))
    return unresolved;
  options.presence?.publish({ checkStatus: "checking" });
  try {
    const response = await options.loadOperationalContext?.();
    const authority =
      response === undefined
        ? null
        : resolveEmployeeShiftEndAuthority(
            attempt.authority.identityGeneration,
            response,
          );
    if (
      authority !== null &&
      employeeShiftEndAuthorityKey(authority) ===
        employeeShiftEndAuthorityKey(attempt.authority)
    )
      return {
        phase: outcome.status === "not-sent" ? "error" : "active",
        result: null,
        failure: null,
        checkStatus: outcome.status,
      };
  } catch {
    /* Keep exact terminal evidence, but do not grant a new attempt. */
  }
  return { ...unresolved, checkStatus: "context-required" as const };
}

export async function recoverEmployeeEndAttempt(
  options: EmployeeShiftEndSessionOptions,
  attempt: EndAttempt,
): Promise<EmployeeShiftEndOutcome> {
  const descriptor = options.presence?.descriptor();
  if (
    descriptor !== undefined &&
    ((attempt.operationId !== undefined &&
      attempt.operationId !== descriptor.operationId) ||
      presenceTargetKey(descriptor.target) !==
        presenceTargetKey(
          endPresenceTarget(attempt.authority, attempt.cashReported),
        ))
  )
    return {
      phase: "uncertain",
      result: null,
      failure: operationalFailure(presenceFailure()),
      checkStatus: "unresolved",
    };
  attempt.operationId ??= descriptor?.operationId;
  const outcome = await options.presence?.checkStatus();
  return outcome === undefined
    ? {
        phase: "uncertain" as const,
        result: null,
        failure: operationalFailure(presenceFailure()),
      }
    : reconcileEmployeeEndRecovery(options, attempt, outcome);
}
