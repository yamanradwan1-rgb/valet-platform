import { EmployeeApiError } from "@valet/employee-client";

import type { NativePushRegistrationState } from "./native-push-types";

export function pushRegistrationFailureState(
  error: unknown,
): Extract<
  NativePushRegistrationState,
  "network-unavailable" | "registration-error"
> {
  return error instanceof EmployeeApiError && error.isNetworkError
    ? "network-unavailable"
    : "registration-error";
}
