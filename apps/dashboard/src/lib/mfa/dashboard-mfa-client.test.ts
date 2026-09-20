import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../api/dashboard-api-client";
import { DashboardMfaClient } from "./dashboard-mfa-client";

describe("DashboardMfaClient", () => {
  it("uses the real state/enrollment routes and retains no secret material", async () => {
    const secret = "A".repeat(32);
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith("/state")) return { state: "ENROLLMENT_REQUIRED" };
      return {
        factorId: "11111111-1111-4111-8111-111111111111",
        provisioning: { secretBase32: secret, issuer: "VAYLET", algorithm: "SHA1", digits: 6, periodSeconds: 30 },
      };
    });
    const client = new DashboardMfaClient({ request } as unknown as DashboardApiClient);

    await expect(client.state()).resolves.toEqual({ state: "ENROLLMENT_REQUIRED" });
    const enrollment = await client.beginEnrollment();
    expect(enrollment.provisioning.secretBase32).toBe(secret);
    expect(request.mock.calls[0]?.[0]).toBe("/v1/staff/auth/mfa/state");
    expect(request.mock.calls[1]?.[0]).toBe("/v1/staff/auth/mfa/enrollment/begin");
    expect(JSON.stringify(client)).not.toContain(secret);
  });

  it("routes step-up, recovery, and reissue without caching codes", async () => {
    const request = vi.fn().mockResolvedValue({ state: "ASSURED" });
    const client = new DashboardMfaClient({ request } as unknown as DashboardApiClient);
    const recoveryCode = `vmr1-${"a".repeat(11)}-${"b".repeat(27)}`;

    await client.stepUp({ code: "123456" });
    await client.beginRecovery({ recoveryCode });
    await client.reissueRecoveryCodes({ code: "654321" });

    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "/v1/staff/auth/mfa/step-up",
      "/v1/staff/auth/mfa/recovery/begin",
      "/v1/staff/auth/mfa/recovery-codes/reissue",
    ]);
    expect(JSON.stringify(client)).not.toContain(recoveryCode);
  });
});
