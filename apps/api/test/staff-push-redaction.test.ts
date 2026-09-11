import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import type { ApiRequest } from "../src/common/http/api-request";
import { staffPushTokenHash } from "../src/modules/staff-push/staff-push-registration-token";

describe("Staff push restricted-data redaction", () => {
  it("uses the accepted versioned SHA-256 equality shape", () => {
    const hash = staffPushTokenHash("synthetic-provider-token-redaction");
    expect(hash).toMatch(/^staff-push-token-sha256:v1:[0-9a-f]{64}$/);
    expect(hash).not.toContain("synthetic-provider-token-redaction");
  });

  it("does not copy request bodies or thrown token details into telemetry/errors", async () => {
    const providerToken = "synthetic-provider-token-canary";
    const tokenHash = staffPushTokenHash(providerToken);
    const observe = vi.fn();
    const runner = new ApiOperationRunner(
      { now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(12) },
      { observe },
    );
    const request = {
      body: { providerToken },
      requestId: "safe-request-id",
    } as unknown as ApiRequest;
    let thrown: unknown;
    try {
      await runner.run("STAFF_PUSH_REGISTRATION_PUT", request, async () => {
        throw new Error(`restricted ${providerToken} ${tokenHash}`);
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect(
      JSON.stringify((thrown as HttpException).getResponse()),
    ).not.toContain(providerToken);
    expect(
      JSON.stringify((thrown as HttpException).getResponse()),
    ).not.toContain(tokenHash);
    expect(JSON.stringify(observe.mock.calls)).not.toContain(providerToken);
    expect(JSON.stringify(observe.mock.calls)).not.toContain(tokenHash);
  });
});
