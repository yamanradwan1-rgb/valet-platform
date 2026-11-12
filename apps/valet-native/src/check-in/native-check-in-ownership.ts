import type {
  EmployeeCheckInSession,
  EmployeeOperationalScope,
} from "@valet/employee-client";

export function nativeCheckInWorkflowOwner(
  scope: Pick<
    EmployeeOperationalScope,
    "membershipId" | "organizationId" | "shiftId" | "role"
  >,
): string {
  return `${scope.organizationId}:${scope.membershipId}:${scope.shiftId}:${scope.role}`;
}

export function captureNativeCheckInRoute(
  checkIn: EmployeeCheckInSession,
  sessionId: string,
  isRouteCurrent: () => boolean,
): () => boolean {
  const snapshot = checkIn.current();
  return () =>
    snapshot.active?.sessionId === sessionId &&
    checkIn.current() === snapshot &&
    isRouteCurrent();
}
