import { EmployeeApiError } from "./api-error";

export type EmployeeHttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type EmployeeAuthorizationRefreshResult =
  "refreshed" | "definitive-failure" | "transient-failure";

export type EmployeeAuthorizationRefreshFailureKind =
  "definitive" | "transient";

const DEFINITIVE_REFRESH_CODES = new Set([
  "STAFF_AUTHENTICATION_FAILED",
  "STAFF_AUTHENTICATION_REQUIRED",
]);

export function shouldRefreshAndRetryEmployeeRequest(
  method: EmployeeHttpMethod,
  status: number,
  alreadyRetried: boolean,
): boolean {
  return (
    status === 401 && !alreadyRetried && (method === "GET" || method === "HEAD")
  );
}

export function shouldReportEmployeeAuthorizationLoss(status: number): boolean {
  return status === 401;
}

export function classifyEmployeeAuthorizationRefreshFailure(
  error: unknown,
): EmployeeAuthorizationRefreshFailureKind {
  if (error instanceof EmployeeApiError) {
    if (error.status === 401) return "definitive";
    if (DEFINITIVE_REFRESH_CODES.has(error.code)) return "definitive";
  }
  return "transient";
}
