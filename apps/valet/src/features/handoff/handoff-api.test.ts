import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { StaffAuthClient } from "../../lib/auth/staff-auth-client";
import {
  abortHandoff,
  completeHandoff,
  initiateHandoff,
  supervisorOverrideHandoff,
  verifyDynamicQr,
  verifyPickupCode,
} from "./handoff-api";

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("handoff API exact contracts", () => {
  let originalFetch: typeof globalThis.fetch;
  let authClient: StaffAuthClient;
  let client: EmployeeApiClient;
  let calls: Array<{ body: unknown; method: string; url: string }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
    authClient = new StaffAuthClient();
    vi.spyOn(authClient, "isTokenFresh").mockReturnValue(true);
    vi.spyOn(authClient, "getAccessToken").mockReturnValue("vsa1_token");
    client = new EmployeeApiClient({ authClient });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockOk(payload: unknown): void {
    globalThis.fetch = vi.fn(
      async (url: string | URL | RequestInfo, init?: RequestInit) => {
        calls.push({
          body: JSON.parse(String(init?.body ?? "{}")),
          method: String(init?.method ?? "GET"),
          url: String(url),
        });
        return new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    ) as unknown as typeof fetch;
  }

  it("initiates handoff with exact route/body", async () => {
    mockOk({
      handoffPendingAt: "2026-08-22T10:00:00.000Z",
      sessionId,
      sessionVersion: 8,
      state: "HANDOFF_PENDING",
      taskId: "22222222-2222-4222-8222-222222222222",
      taskStatus: "IN_PROGRESS",
      taskVersion: 5,
    });
    const res = await initiateHandoff(client, sessionId, 7);
    expect(res.state).toBe("HANDOFF_PENDING");
    expect(calls[0]).toEqual({
      body: { expectedSessionVersion: 7 },
      method: "POST",
      url: `/v1/staff/valet-sessions/${sessionId}/initiate-handoff`,
    });
  });

  it("verifies pickup code preserving leading zero", async () => {
    mockOk({
      method: "PICKUP_CODE",
      sessionId,
      sessionVersion: 9,
      state: "HANDOFF_PENDING",
      taskId: "22222222-2222-4222-8222-222222222222",
      taskStatus: "IN_PROGRESS",
      taskVersion: 5,
      verificationStatus: "VERIFIED",
      verifiedAt: "2026-08-22T10:01:00.000Z",
    });
    await verifyPickupCode(client, sessionId, {
      expectedSessionVersion: 8,
      pickupCode: "0482",
    });
    expect(calls[0]?.body).toEqual({
      expectedSessionVersion: 8,
      pickupCode: "0482",
    });
    expect(calls[0]?.url).toBe(
      `/v1/staff/valet-sessions/${sessionId}/verify-pickup-code`,
    );
  });

  it("rejects malformed pickup code locally without a request", async () => {
    await expect(
      verifyPickupCode(client, sessionId, {
        expectedSessionVersion: 8,
        pickupCode: "12a4",
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("verifies dynamic QR payload exactly", async () => {
    const qr = `vhq1.${"A".repeat(43)}`;
    mockOk({
      method: "DYNAMIC_QR",
      sessionId,
      sessionVersion: 9,
      state: "HANDOFF_PENDING",
      taskId: "22222222-2222-4222-8222-222222222222",
      taskStatus: "IN_PROGRESS",
      taskVersion: 5,
      verificationStatus: "VERIFIED",
      verifiedAt: "2026-08-22T10:02:00.000Z",
    });
    await verifyDynamicQr(client, sessionId, {
      expectedSessionVersion: 8,
      qrPayload: qr,
    });
    expect(calls[0]?.body).toEqual({
      expectedSessionVersion: 8,
      qrPayload: qr,
    });
    expect(calls[0]?.url).toBe(
      `/v1/staff/valet-sessions/${sessionId}/verify-dynamic-qr`,
    );
  });

  it("sends supervisor override with bounded reason", async () => {
    mockOk({
      method: "SUPERVISOR_OVERRIDE",
      sessionId,
      sessionVersion: 9,
      state: "HANDOFF_PENDING",
      taskId: "22222222-2222-4222-8222-222222222222",
      taskStatus: "IN_PROGRESS",
      taskVersion: 5,
      verificationStatus: "VERIFIED",
      verifiedAt: "2026-08-22T10:03:00.000Z",
    });
    await supervisorOverrideHandoff(client, sessionId, {
      expectedSessionVersion: 8,
      reason: "Guest identity confirmed",
    });
    expect(calls[0]?.body).toEqual({
      expectedSessionVersion: 8,
      reason: "Guest identity confirmed",
    });
    expect(calls[0]?.url).toBe(
      `/v1/staff/valet-sessions/${sessionId}/supervisor-override-handoff`,
    );
  });

  it("aborts with exact reason/version and completes with exact version", async () => {
    mockOk({
      sessionId,
      sessionVersion: 9,
      state: "READY",
      taskId: "22222222-2222-4222-8222-222222222222",
      taskStatus: "IN_PROGRESS",
      taskVersion: 5,
    });
    await abortHandoff(client, sessionId, {
      expectedSessionVersion: 8,
      reason: "Guest left",
    });
    expect(calls[0]?.body).toEqual({
      expectedSessionVersion: 8,
      reason: "Guest left",
    });
    expect(calls[0]?.url).toBe(
      `/v1/staff/valet-sessions/${sessionId}/abort-handoff`,
    );

    mockOk({
      retrievalRequestStatus: "COMPLETED",
      sessionId,
      sessionVersion: 10,
      state: "COMPLETED",
      taskId: "22222222-2222-4222-8222-222222222222",
      taskStatus: "COMPLETED",
      taskVersion: 6,
    });
    const done = await completeHandoff(client, sessionId, 9);
    expect(done.taskStatus).toBe("COMPLETED");
    expect(calls[1]?.body).toEqual({ expectedSessionVersion: 9 });
    expect(calls[1]?.url).toBe(
      `/v1/staff/valet-sessions/${sessionId}/complete-handoff`,
    );
  });
});
