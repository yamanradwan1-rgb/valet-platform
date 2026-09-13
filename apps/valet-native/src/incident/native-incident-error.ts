import { EmployeeApiError } from "@valet/employee-client";

export const NATIVE_INCIDENT_OPERATION_FAILED =
  "NATIVE_INCIDENT_OPERATION_FAILED";

export function nativeIncidentPresentationError(error: unknown): string {
  return error instanceof EmployeeApiError && error.message.trim().length > 0
    ? error.message
    : NATIVE_INCIDENT_OPERATION_FAILED;
}
