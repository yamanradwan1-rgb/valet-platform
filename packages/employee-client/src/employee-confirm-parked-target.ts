import type { EmployeeOperationalScope } from "./employee-operational-types";
import type { EmployeeConfirmParkedTarget } from "./employee-confirm-parked-state";

export function confirmParkedTarget(
  identityGeneration: number,
  scope: EmployeeOperationalScope,
  taskId: string,
  sessionId: string,
): EmployeeConfirmParkedTarget {
  return {
    identityGeneration,
    locationId: scope.locationId,
    membershipId: scope.membershipId,
    organizationId: scope.organizationId,
    sessionId,
    shiftId: scope.shiftId,
    taskId,
  };
}
