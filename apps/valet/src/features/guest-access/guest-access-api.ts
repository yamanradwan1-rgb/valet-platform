import {
  guestAccessIssueResponseSchema,
  guestAccessRevokeResponseSchema,
  type GuestAccessIssueRequest,
  type GuestAccessIssueResponse,
  type GuestAccessRevokeResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type { GuestAccessIssueRequest };

export interface GuestAccessRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * Typed adapters for the existing Guest Access mutation routes. The backend
 * command semantics (authentication, authorization, locking, audit) are
 * unchanged; these adapters only transport the shared contract payloads.
 */
export async function issueGuestAccess(
  client: EmployeeApiClient,
  sessionId: string,
  request: GuestAccessIssueRequest,
  options: GuestAccessRequestOptions = {},
): Promise<GuestAccessIssueResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
    {
      body: request,
      method: "POST",
      requireAuth: true,
      signal: options.signal,
    },
  );
  return guestAccessIssueResponseSchema.parse(raw);
}

export async function revokeGuestAccess(
  client: EmployeeApiClient,
  sessionId: string,
  options: GuestAccessRequestOptions = {},
): Promise<GuestAccessRevokeResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/check-in/sessions/${sessionId}/guest-access/revoke`,
    {
      body: {},
      method: "POST",
      requireAuth: true,
      signal: options.signal,
    },
  );
  return guestAccessRevokeResponseSchema.parse(raw);
}
