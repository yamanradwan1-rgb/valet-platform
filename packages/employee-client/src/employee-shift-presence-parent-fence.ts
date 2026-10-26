import type { EmployeeShiftPresenceSession } from "./employee-shift-presence-session";
import type { EmployeeShiftStartAuthority } from "./employee-shift-start-context";
import type { EmployeeShiftStartSnapshot } from "./employee-shift-start-types";
import type { EmployeeShiftEndSnapshot } from "./employee-shift-end-types";
import type { EndAttempt } from "./employee-shift-end-attempt";
import { presenceTargetKey } from "./employee-shift-presence-types";
import {
  endPresenceTarget,
  matchesStartPresenceTarget,
} from "./employee-shift-presence-target";

/** Exception dispatch can occur while the parent still presents a local failure. */
export function suspendedStartAttempt(
  presence: EmployeeShiftPresenceSession | undefined,
  pending: EmployeeShiftStartAuthority | undefined,
  authorities: Map<string, EmployeeShiftStartAuthority>,
  phase: EmployeeShiftStartSnapshot["phase"],
): EmployeeShiftStartAuthority | undefined {
  if (pending !== undefined && ["submitting", "verifying"].includes(phase))
    return { ...pending };
  if (presence?.snapshot().phase !== "uncertain") return;
  const target = presence.descriptor()?.target;
  if (target === undefined) return;
  const authority = authorities.get(target.locationId);
  return matchesStartPresenceTarget(authority, target)
    ? { ...authority! }
    : undefined;
}

export function suspendedEndAttempt(
  presence: EmployeeShiftPresenceSession | undefined,
  attempt: EndAttempt | undefined,
  snapshot: EmployeeShiftEndSnapshot,
  workflowGeneration: number,
): EndAttempt | undefined {
  if (
    attempt !== undefined &&
    ["submitting", "uncertain"].includes(snapshot.phase)
  )
    return { ...attempt, workflowGeneration };
  if (presence?.snapshot().phase !== "uncertain") return;
  const target = presence.descriptor()?.target;
  const authority = snapshot.authority;
  if (
    target === undefined ||
    authority === null ||
    target.shiftId !== authority.shiftId ||
    target.cashReported === null ||
    presenceTargetKey(target) !==
      presenceTargetKey(endPresenceTarget(authority, target.cashReported))
  )
    return;
  return {
    authority,
    cashReported: target.cashReported,
    workflowGeneration,
    operationId: presence?.descriptor()?.operationId,
  };
}

export function suspendedEndSnapshot(
  snapshot: EmployeeShiftEndSnapshot,
): EmployeeShiftEndSnapshot {
  return {
    ...snapshot,
    failure: {
      code: "SHIFT_END_RESULT_UNKNOWN",
      message: "The Shift end result could not be confirmed.",
    },
    phase: "uncertain",
  };
}
