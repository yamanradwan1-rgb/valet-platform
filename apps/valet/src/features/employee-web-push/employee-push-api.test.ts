import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeWebPushApi } from "./employee-push-api";

const ID = "11111111-1111-4111-8111-111111111111";
const response = {
  audience: "EMPLOYEE",
  browserExpiresAt: null,
  createdAt: "2026-08-31T00:00:00.000Z",
  id: ID,
  locale: "en",
  status: "ACTIVE",
  updatedAt: "2026-08-31T00:00:00.000Z",
};
const input = {
  auth: "AQIDBAUGBwgJCgsMDQ4PEA",
  browserExpiresAt: null,
  endpoint: "https://push.example.test/device",
  locale: "en" as const,
  p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]).toString(
    "base64url",
  ),
};

describe("Employee T2 Web Push API adapter", () => {
  it("uses the authenticated staff create and replace contracts", async () => {
    const request = vi.fn().mockResolvedValue(response);
    const api = new EmployeeWebPushApi({
      request,
    } as unknown as EmployeeApiClient);
    await api.create(input);
    await api.replace(ID, input);
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/v1/staff/web-push/subscriptions",
      { body: input, method: "POST" },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      `/v1/staff/web-push/subscriptions/${ID}`,
      { body: input, method: "PUT" },
    );
  });

  it("uses the exact self-owned disable contract without a body", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ...response, status: "DISABLED" });
    const api = new EmployeeWebPushApi({
      request,
    } as unknown as EmployeeApiClient);
    await api.disable(ID);
    expect(request).toHaveBeenCalledWith(
      `/v1/staff/web-push/subscriptions/${ID}`,
      { body: undefined, method: "DELETE" },
    );
  });
});
