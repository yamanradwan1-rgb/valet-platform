import type { EmployeeOperationalScope } from "@valet/employee-client";

export function nativeCheckInWorkflowOwner(
  scope: Pick<
    EmployeeOperationalScope,
    "membershipId" | "organizationId" | "shiftId"
  >,
): string {
  return `${scope.organizationId}:${scope.membershipId}:${scope.shiftId}`;
}
