import { EmployeeApiError } from "@valet/employee-client";

import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";

/**
 * Conflict is a fixed, content-free classification. Never forward the error
 * message, prior owner, installation identifier or provider token.
 */
export function recordNativePushRegistrationConflict(error: unknown): void {
  if (
    error instanceof EmployeeApiError &&
    error.status === 409 &&
    error.code === "STAFF_PUSH_REGISTRATION_CONFLICT"
  ) {
    getNativeTelemetry().record({
      classification: "registration-conflict",
      outcome: "error",
      source: "push",
    });
  }
}
