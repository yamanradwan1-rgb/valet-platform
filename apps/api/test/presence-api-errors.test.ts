import { describe, expect, it } from "vitest";
import { shiftPresencePublicErrorCodeSchema } from "@valet/contracts";
import { mapPresenceApiError } from "../src/common/http/presence-api-errors";

describe("complete published presence error mapping", () => {
  it.each(shiftPresencePublicErrorCodeSchema.options)(
    "%s has a controlled public status/message",
    (code) => {
      const expected =
        code === "PRESENCE_SECURITY_UNAVAILABLE"
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
