import type { EmployeeOperationalScope } from "@valet/employee-client";

export function nativeCheckInWorkflowOwner(
  scope: Pick<
    EmployeeOperationalScope,
    "membershipId" | "organizationId" | "shiftId" | "role"
  >,
): string {
  return `${scope.organizationId}:${scope.membershipId}:${scope.shiftId}:${scope.role}`;
}
