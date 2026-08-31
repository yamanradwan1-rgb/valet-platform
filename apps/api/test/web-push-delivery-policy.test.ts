import { describe, expect, it } from "vitest";

import {
  classifyWebPushOutcome,
  computeWebPushRetry,
  parseRetryAfter,
} from "../src/modules/web-push-delivery/web-push-delivery-policy";

describe("Web Push delivery policy", () => {
  it.each([
    [201, "ACCEPTED"],
    [404, "ENDPOINT_GONE"],
    [410, "ENDPOINT_GONE"],
    [429, "RETRY"],
    [500, "RETRY"],
    [401, "CONFIGURATION"],
    [403, "CONFIGURATION"],
    [400, "PAYLOAD"],
  ] as const)("maps status %i to %s", (status, expected) => {
    expect(classifyWebPushOutcome(status)).toBe(expected);
  });

  it("parses both Retry-After forms and rejects malformed values", () => {
    const now = new Date("2026-08-30T00:00:00.000Z");
    expect(parseRetryAfter("12", now)?.toISOString()).toBe(
      "2026-08-30T00:00:12.000Z",
    );
    expect(
      parseRetryAfter("Sun, 30 Aug 2026 00:00:20 GMT", now)?.toISOString(),
    ).toBe("2026-08-30T00:00:20.000Z");
    expect(parseRetryAfter("later", now)).toBeUndefined();
  });

  it("uses bounded jitter and stops at the attempt cap or event expiry", () => {
    const now = new Date("2026-08-30T00:00:00.000Z");
    const expiresAt = new Date("2026-08-30T00:05:00.000Z");
    expect(
      computeWebPushRetry({ attempt: 1, expiresAt, now, random: () => 0 }),
    ).toEqual({ nextAttemptAt: new Date("2026-08-30T00:00:02.500Z") });
    expect(
      computeWebPushRetry({ attempt: 5, expiresAt, now, random: () => 0.5 }),
    ).toEqual({ terminal: true });
    expect(
      computeWebPushRetry({
        attempt: 4,
        expiresAt: new Date("2026-08-30T00:00:01.000Z"),
        now,
        random: () => 1,
      }),
    ).toEqual({ terminal: true });
  });
});
