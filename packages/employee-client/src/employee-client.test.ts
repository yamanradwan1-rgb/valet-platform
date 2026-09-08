import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "./api-error";
import {
  EmployeeClient,
  type EmployeeTransport,
  type EmployeeTransportResponse,
} from "./employee-client";
import {
  classifyEmployeeAuthorizationRefreshFailure,
  shouldRefreshAndRetryEmployeeRequest,
} from "./recovery-policy";

function sequenceTransport(
  responses: EmployeeTransportResponse[],
): EmployeeTransport {
  return {
    execute: vi.fn(async () => {
      const response = responses.shift();
      if (response === undefined) throw new Error("Unexpected transport call");
      return response;
    }),
  };
}

describe("EmployeeClient", () => {
  it("uses the injected transport and returns its successful payload", async () => {
    const transport = sequenceTransport([
      { payload: { status: "ok" }, status: 200 },
    ]);
    const client = new EmployeeClient({ transport });

    await expect(
      client.request({ method: "GET", path: "/v1/staff/tasks" }),
    ).resolves.toEqual({ status: "ok" });
    expect(transport.execute).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/staff/tasks",
    });
  });

  it("retries a safe read once after a successful authorization refresh", async () => {
    const transport = sequenceTransport([
      {
        payload: { code: "STAFF_AUTHENTICATION_REQUIRED", message: "expired" },
        status: 401,
      },
      { payload: { tasks: [] }, status: 200 },
    ]);
    const refreshAuthorization = vi.fn(async () => "refreshed" as const);
    const client = new EmployeeClient({
      transport,
      authorizationRecovery: { allowRefresh: true, refreshAuthorization },
    });

    await expect(
      client.request({ method: "GET", path: "/v1/staff/tasks" }),
    ).resolves.toEqual({ tasks: [] });
    expect(transport.execute).toHaveBeenCalledTimes(2);
    expect(refreshAuthorization).toHaveBeenCalledTimes(1);
  });

  it("never automatically replays a protected mutation", async () => {
    const transport = sequenceTransport([
      {
        payload: { code: "STAFF_AUTHENTICATION_REQUIRED", message: "expired" },
        status: 401,
      },
    ]);
    const refreshAuthorization = vi.fn(async () => "refreshed" as const);
    const onAuthorizationLoss = vi.fn();
    const client = new EmployeeClient({
      transport,
      authorizationRecovery: {
        allowRefresh: true,
        onAuthorizationLoss,
        refreshAuthorization,
      },
    });

    await expect(
      client.request({ method: "POST", path: "/v1/staff/check-in/intake" }),
    ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_REQUIRED" });
    expect(transport.execute).toHaveBeenCalledTimes(1);
    expect(refreshAuthorization).not.toHaveBeenCalled();
    expect(onAuthorizationLoss).toHaveBeenCalledTimes(1);
  });

  it("preserves the bounded transport Retry-After for safe presentation", async () => {
    const client = new EmployeeClient({
      transport: sequenceTransport([
        {
          payload: {
            code: "HANDOFF_VERIFICATION_RATE_LIMITED",
            message: "wait",
            requestId: "req_123",
          },
          retryAfter: 30,
          status: 429,
        },
      ]),
    });
    await expect(
      client.request({ method: "POST", path: "/verify" }),
    ).rejects.toMatchObject({
      code: "HANDOFF_VERIFICATION_RATE_LIMITED",
      retryAfter: 30,
    });
  });

  it("keeps a transient refresh outage distinct from auth loss", async () => {
    const transport = sequenceTransport([
      {
        payload: { code: "STAFF_AUTHENTICATION_REQUIRED", message: "expired" },
        status: 401,
      },
    ]);
    const onAuthorizationLoss = vi.fn();
    const client = new EmployeeClient({
      transport,
      authorizationRecovery: {
        allowRefresh: true,
        onAuthorizationLoss,
        refreshAuthorization: async () => "transient-failure",
      },
    });

    await expect(
      client.request({ method: "HEAD", path: "/v1/staff/tasks" }),
    ).rejects.toMatchObject({
      code: "STAFF_SESSION_SERVICE_UNAVAILABLE",
      isNetworkError: true,
    });
    expect(onAuthorizationLoss).not.toHaveBeenCalled();
  });
});

describe("Employee recovery policy", () => {
  it("allows one GET/HEAD retry but no mutation retry", () => {
    expect(shouldRefreshAndRetryEmployeeRequest("GET", 401, false)).toBe(true);
    expect(shouldRefreshAndRetryEmployeeRequest("HEAD", 401, false)).toBe(true);
    expect(shouldRefreshAndRetryEmployeeRequest("GET", 401, true)).toBe(false);
    expect(shouldRefreshAndRetryEmployeeRequest("POST", 401, false)).toBe(
      false,
    );
    expect(shouldRefreshAndRetryEmployeeRequest("PATCH", 401, false)).toBe(
      false,
    );
  });

  it("classifies only accepted definitive refresh evidence as definitive", () => {
    expect(
      classifyEmployeeAuthorizationRefreshFailure(
        new EmployeeApiError({
          code: "STAFF_AUTHENTICATION_REQUIRED",
          message: "expired",
          status: 401,
        }),
      ),
    ).toBe("definitive");
    expect(
      classifyEmployeeAuthorizationRefreshFailure(
        new EmployeeApiError({
          code: "NETWORK_ERROR",
          message: "offline",
          status: 0,
        }),
      ),
    ).toBe("transient");
    expect(classifyEmployeeAuthorizationRefreshFailure(new Error("down"))).toBe(
      "transient",
    );
  });
});
