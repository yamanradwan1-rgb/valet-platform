import { describe, expect, it, vi } from "vitest";
import type {
  GuestAccessIssueResponse,
  GuestAccessRevokeResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { issueGuestAccess, revokeGuestAccess } from "./guest-access-api";

const VALID_TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_";

function mockClient(payload: unknown): EmployeeApiClient {
  return { request: vi.fn().mockResolvedValue(payload) } as unknown as EmployeeApiClient;
}

function issuePayload(): GuestAccessIssueResponse {
  return {
    expiresAt: "2026-08-22T18:05:00.000Z",
    issuedAt: "2026-08-21T18:05:00.000Z",
    mutationKind: "ISSUED",
    rawToken: VALID_TOKEN,
    valetSessionId: "11111111-1111-4111-8111-111111111111",
  };
}

describe("Guest Access adapters", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";

  it("issues with ISSUE_OR_ROTATE against the existing route", async () => {
    const client = mockClient(issuePayload());

    const result = await issueGuestAccess(client, sessionId, {
      intent: "ISSUE_OR_ROTATE",
    });

    expect(client.request).toHaveBeenCalledWith(
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      expect.objectContaining({ body: { intent: "ISSUE_OR_ROTATE" }, method: "POST" }),
    );
    expect(result.rawToken).toBe(VALID_TOKEN);
    expect(result.mutationKind).toBe("ISSUED");
  });

  it("reissues a revoked credential with the exact expectedRevokedAt", async () => {
    const client = mockClient({
      ...issuePayload(),
      mutationKind: "ROTATED",
    });

    const result = await issueGuestAccess(client, sessionId, {
      expectedRevokedAt: "2026-08-21T19:30:00.456Z",
      intent: "REISSUE_REVOKED",
    });

    expect(client.request).toHaveBeenCalledWith(
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
      expect.objectContaining({
        body: {
          expectedRevokedAt: "2026-08-21T19:30:00.456Z",
          intent: "REISSUE_REVOKED",
        },
        method: "POST",
      }),
    );
    expect(result.mutationKind).toBe("ROTATED");
  });

  it("revokes against the existing route with an empty body", async () => {
    const payload: GuestAccessRevokeResponse = {
      revokedAt: "2026-08-21T20:00:00.000Z",
      valetSessionId: sessionId,
    };
    const client = mockClient(payload);

    const result = await revokeGuestAccess(client, sessionId);

    expect(client.request).toHaveBeenCalledWith(
      `/v1/staff/check-in/sessions/${sessionId}/guest-access/revoke`,
      expect.objectContaining({ body: {}, method: "POST" }),
    );
    expect(result.revokedAt).toBe("2026-08-21T20:00:00.000Z");
  });

  it("rejects issue responses whose raw token violates the exact shape", async () => {
    const client = mockClient({ ...issuePayload(), rawToken: "too-short" });

    await expect(
      issueGuestAccess(client, sessionId, { intent: "ISSUE_OR_ROTATE" }),
    ).rejects.toThrow();
  });
});
