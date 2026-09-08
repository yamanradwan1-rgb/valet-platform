import type { NativeAuthSession } from "@valet/employee-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNativeEmployeeClient } from "../src/tasks/native-operational-http";

afterEach(() => vi.unstubAllGlobals());

describe("Native Retry-After transport", () => {
  it("carries a numeric response header into the safe API error", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "HANDOFF_VERIFICATION_RATE_LIMITED",
            message: "wait",
            requestId: "req_123",
          },
          { headers: { "Retry-After": "30" }, status: 429 },
        ),
      ),
    );
    const auth = {
      current: vi.fn(() => ({ authGeneration: 1, phase: "authenticated" })),
      getAccessToken: vi.fn(() => `vsa1.${"a".repeat(43)}`),
      handleDefinitiveAuthorizationLoss: vi.fn(),
      refresh: vi.fn(),
    } as unknown as NativeAuthSession;
    await expect(
      createNativeEmployeeClient("https://api.example.com", auth).request({
        method: "POST",
        path: "/verify",
      }),
    ).rejects.toMatchObject({ retryAfter: 30, status: 429 });
  });
});
