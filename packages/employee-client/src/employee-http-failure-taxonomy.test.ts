import { describe, expect, it, vi } from "vitest";
import { EmployeeClient, type EmployeeTransport } from "./employee-client";
import { employeeNetworkError } from "./api-error";
import { shouldReportEmployeeAuthorizationLoss } from "./recovery-policy";

describe("Employee HTTP failure taxonomy", () => {
  it.each([403, 408, 409, 429, 500])(
    "does not classify HTTP %s as credential loss or retry it",
    async (status) => {
      const onAuthorizationLoss = vi.fn();
      const execute = vi.fn(async () => ({
        payload: { code: `FAILURE_${status}`, message: "unavailable" },
        retryAfter: status === 429 ? 30 : undefined,
        status,
      }));
      const client = new EmployeeClient({
        authorizationRecovery: {
          allowRefresh: true,
          onAuthorizationLoss,
          refreshAuthorization: vi.fn(async () => "refreshed" as const),
        },
        transport: { execute } as EmployeeTransport,
      });
      await expect(
        client.request({ method: "GET", path: "/v1/staff/tasks" }),
      ).rejects.toMatchObject({ status });
      expect(execute).toHaveBeenCalledOnce();
      expect(onAuthorizationLoss).not.toHaveBeenCalled();
    },
  );

  it("keeps a connection failure transient without refresh or logout", async () => {
    const refreshAuthorization = vi.fn(async () => "refreshed" as const);
    const onAuthorizationLoss = vi.fn();
    const client = new EmployeeClient({
      authorizationRecovery: {
        allowRefresh: true,
        onAuthorizationLoss,
        refreshAuthorization,
      },
      transport: {
        execute: vi.fn(async () => {
          throw employeeNetworkError();
        }),
      },
    });
    await expect(
      client.request({ method: "GET", path: "/v1/staff/tasks" }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(refreshAuthorization).not.toHaveBeenCalled();
    expect(onAuthorizationLoss).not.toHaveBeenCalled();
  });

  it("reports only 401 as transport-level credential loss", () => {
    expect(shouldReportEmployeeAuthorizationLoss(401)).toBe(true);
    expect(shouldReportEmployeeAuthorizationLoss(403)).toBe(false);
    expect(shouldReportEmployeeAuthorizationLoss(404)).toBe(false);
  });

  it("preserves bounded 429 retry information without retrying", async () => {
    const client = new EmployeeClient({
      transport: {
        execute: vi.fn(async () => ({
          payload: { code: "RATE_LIMITED", message: "wait" },
          retryAfter: 45,
          status: 429,
        })),
      },
    });
    await expect(
      client.request({ method: "GET", path: "/v1/staff/tasks" }),
    ).rejects.toMatchObject({ retryAfter: 45, status: 429 });
  });
});
