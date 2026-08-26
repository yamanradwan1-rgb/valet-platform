import { describe, expect, it } from "vitest";

import { DashboardApiError } from "./api-error";
import {
  binaryResponse,
  caught,
  jsonResponse,
  makeClient,
  stubFetch,
  VALID_TOKEN,
} from "./staff-api-client-binary-test-support";

/**
 * Binary failure honesty tests (D4-002): non-2xx JSON errors map into
 * DashboardApiError kinds and are NEVER returned as downloadable bytes;
 * caller aborts stay unmasked; fetch rejections become honest network
 * failures; and a 2xx document body is rejected as contract drift.
 */

describe("binary failure honesty", () => {
  it("maps non-2xx JSON errors into DashboardApiError, never into bytes", async () => {
    for (const [status, code, expectedKind] of [
      [403, "ROLE_FORBIDDEN", "forbidden"],
      [404, "AUTHORIZATION_DENIED", "authorization-masked"],
      [400, "REQUEST_INVALID", "validation"],
      [422, "REPORT_EXPORT_TOO_LARGE", "validation"],
      [500, "INTERNAL_ERROR", "server"],
    ] as const) {
      stubFetch(() => jsonResponse(status, { code }));
      const { client } = makeClient({ token: VALID_TOKEN });
      const error = await caught(client.requestBinary("/dashboard/artifact"));
      expect(error).toBeInstanceOf(DashboardApiError);
      expect((error as DashboardApiError).kind).toBe(expectedKind);
      expect((error as DashboardApiError).code).toBe(code);
    }
  });

  it("rejects a 2xx JSON/document body as contract drift, not a download", async () => {
    for (const contentType of ["application/json", "text/html"]) {
      stubFetch(() =>
        binaryResponse({
          contentType,
          body: JSON.stringify({ unexpected: true }),
        }),
      );
      const { client } = makeClient({ token: VALID_TOKEN });
      const error = await caught(client.requestBinary("/dashboard/artifact"));
      expect(error).toBeInstanceOf(DashboardApiError);
      expect((error as DashboardApiError).code).toBe(
        "BINARY_RESPONSE_CONTENT_TYPE_INVALID",
      );
    }
  });

  it("preserves caller aborts instead of masking them as network errors", async () => {
    const controller = new AbortController();
    stubFetch(() => {
      controller.abort();
      return Promise.reject(new Error("The operation was aborted."));
    });
    const { client } = makeClient({ token: VALID_TOKEN });

    await expect(
      client.requestBinary("/dashboard/artifact", {
        signal: controller.signal,
      }),
    ).rejects.not.toBeInstanceOf(DashboardApiError);
  });

  it("maps fetch rejections to an honest network failure", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    const { client } = makeClient({ token: VALID_TOKEN });

    const error = await caught(client.requestBinary("/dashboard/artifact"));
    expect(error).toBeInstanceOf(DashboardApiError);
    const apiError = error as DashboardApiError;
    expect(apiError.code).toBe("NETWORK_ERROR");
    expect(apiError.isNetworkError).toBe(true);
    expect(apiError.kind).not.toBe("session-expired");
  });
});
