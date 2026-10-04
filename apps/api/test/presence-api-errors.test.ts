import { describe, expect, it } from "vitest";
import { shiftPresencePublicErrorCodeSchema } from "@valet/contracts";
import { mapPresenceApiError } from "../src/common/http/presence-api-errors";
import { mapApiError, apiHttpException } from "../src/common/http/api-errors";
import { AntiAbuseRateLimitError } from "../src/modules/anti-abuse/anti-abuse.service";

describe("complete published presence error mapping", () => {
  it("preserves database-authored Retry-After through the existing HTTP exception boundary", () => {
    const mapped = mapApiError(
      new AntiAbuseRateLimitError("SHIFT_PRESENCE_RATE_LIMITED", 417),
    );
    expect(mapped).toMatchObject({ status: 429, retryAfter: 417 });
    expect(
      apiHttpException(mapped, "synthetic") as { retryAfter?: number },
    ).toMatchObject({ retryAfter: 417 });
  });
  it.each(shiftPresencePublicErrorCodeSchema.options)(
    "%s has a controlled public status/message",
    (code) => {
      const expected =
        code === "SHIFT_PRESENCE_RATE_LIMITED"
          ? 429
          : code === "PRESENCE_SECURITY_UNAVAILABLE"
            ? 503
            : code === "PRESENCE_REQUIRED" || code === "PRESENCE_REJECTED"
              ? 422
              : 409;
      expect(mapPresenceApiError(code)).toMatchObject({
        code,
        status: expected,
      });
      expect(mapPresenceApiError(code)?.message).not.toMatch(
        /SQL|fingerprint|latitude|longitude/i,
      );
    },
  );
  it("conceals internal scope mismatch and ignores unknown exception strings", () => {
    expect(mapPresenceApiError("PRESENCE_SCOPE_MISMATCH")).toMatchObject({
      code: "AUTHORIZATION_DENIED",
      status: 404,
    });
    expect(mapPresenceApiError("Untrusted SQL error")).toBeUndefined();
    expect(mapPresenceApiError(null)).toBeUndefined();
  });
});
