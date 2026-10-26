import { isEmployeeShiftCashValid } from "./employee-shift-end-state";
import type { EmployeeShiftEndSession } from "./employee-shift-end-session";
import type { EmployeeShiftEndSnapshot } from "./employee-shift-end-types";

export function changeEndCash(
  session: EmployeeShiftEndSession,
  cashInput: string,
): EmployeeShiftEndSnapshot | undefined {
  const snapshot = session.current();
  const presence = session.presence?.snapshot();
  if (
    presence?.checkStatus === "checking" ||
    ["uncertain", "pending", "approved", "submitting"].includes(
      presence?.phase ?? "",
    )
  )
    return;
  if (!["active", "blocked-open-work", "error"].includes(snapshot.phase))
    return;
  return {
    ...snapshot,
    cashInput,
    cashValidationVisible:
      snapshot.cashValidationVisible && !isEmployeeShiftCashValid(cashInput),
    failure: null,
    phase: "active",
  };
}
export function confirmEnd(
  session: EmployeeShiftEndSession,
): EmployeeShiftEndSnapshot | undefined {
  const snapshot = session.current();
  const presence = session.presence?.snapshot();
  if (
    presence?.checkStatus === "checking" ||
    ["uncertain", "pending", "submitting"].includes(presence?.phase ?? "")
  )
    return;
  if (
    !snapshot.online ||
    snapshot.authority === null ||
    !["active", "blocked-open-work", "error"].includes(snapshot.phase)
  )
    return;
  return isEmployeeShiftCashValid(snapshot.cashInput)
    ? {
        ...snapshot,
        cashValidationVisible: false,
        failure: null,
        phase: "confirming",
      }
    : { ...snapshot, cashValidationVisible: true };
}
