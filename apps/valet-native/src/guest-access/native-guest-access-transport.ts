import {
  EmployeeApiError,
  type EmployeeClient,
  type GuestAccessIssueRequest,
} from "@valet/employee-client";
import type { NativeGuestAccessError } from "./native-guest-access-types";

export function ambiguousGuestAccessError(
  error: unknown,
): NativeGuestAccessError | null {
  if (!(error instanceof EmployeeApiError)) return null;
  if (error.code === "GUEST_ACCESS_INTENT_CONFLICT") return "INTENT_CONFLICT";
  return error.isNetworkError || error.status === 408 || error.status === 504
    ? "OUTCOME_UNKNOWN"
    : null;
}

export function loadNativeGuestAccess(
  client: EmployeeClient,
  sessionId: string,
): Promise<unknown> {
  return client.request<unknown>({
    method: "GET",
    path: `/v1/staff/valet-sessions/${sessionId}`,
  });
}

export function issueNativeGuestAccess(
  client: EmployeeClient,
  sessionId: string,
  body: GuestAccessIssueRequest,
): Promise<unknown> {
  return client.request<unknown>({
    body,
    method: "POST",
    path: `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
  });
}

export function revokeNativeGuestAccess(
  client: EmployeeClient,
  sessionId: string,
): Promise<unknown> {
  return client.request<unknown>({
    body: {},
    method: "POST",
    path: `/v1/staff/check-in/sessions/${sessionId}/guest-access/revoke`,
  });
}
