import { describe, expect, it } from "vitest";
import { GuestApiError } from "../../lib/api/api-error";
import {
  classifyGuestPushFailure,
  guestPushFeedbackCopy,
} from "./guest-web-push-feedback";
import {
  GuestWebPushStageError,
  GuestWebPushTimeoutError,
} from "./guest-web-push-stage";

describe("safe Guest Push feedback", () => {
  it.each([
    [401, "AUTH"],
    [403, "AUTH"],
    [409, "CONFLICT"],
    [429, "RATE_LIMITED"],
    [503, "SERVER"],
  ])(
    "classifies a conclusive HTTP %i without exposing its message",
    (status, kind) => {
      const result = classifyGuestPushFailure(
        new GuestApiError({
          status,
          code: "REQUEST_FAILED",
          message: "sensitive upstream details",
        }),
      );
      expect(result.kind).toBe(kind);
      for (const locale of ["en", "ar"] as const) {
        expect(guestPushFeedbackCopy(locale, result.kind)).not.toContain(
          "sensitive",
        );
        expect(
          guestPushFeedbackCopy(locale, result.kind).length,
        ).toBeGreaterThan(10);
      }
    },
  );
  it.each([
    "MUTATION_OUTCOME_UNKNOWN",
    "GUEST_CONTEXT_CHANGED",
    "GUEST_REQUEST_CANCELLED",
  ])("preserves %s semantics", (code) => {
    expect(
      classifyGuestPushFailure(
        new GuestApiError({ status: 0, code, message: "private" }),
      ).kind,
    ).toBe(
      {
        MUTATION_OUTCOME_UNKNOWN: "UNKNOWN",
        GUEST_CONTEXT_CHANGED: "CONTEXT",
        GUEST_REQUEST_CANCELLED: "CANCELLED",
      }[code],
    );
  });
  it("treats the server-stage deadline as unknown while distinguishing earlier timeouts", () => {
    expect(
      classifyGuestPushFailure(
        new GuestWebPushTimeoutError("server registration"),
      ).kind,
    ).toBe("UNKNOWN");
    expect(
      classifyGuestPushFailure(new GuestWebPushTimeoutError("service worker"))
        .kind,
    ).toBe("WORKER_TIMEOUT");
    expect(
      classifyGuestPushFailure(new GuestWebPushTimeoutError("permission")).kind,
    ).toBe("TIMEOUT");
    expect(
      classifyGuestPushFailure(
        new GuestWebPushStageError("server registration", new Error("lost")),
      ).kind,
    ).toBe("UNKNOWN");
  });
  it.each([
    ["service worker", "WORKER"],
    ["public key", "CONFIG"],
    ["subscribe", "SUBSCRIPTION"],
    ["existing subscription", "SUBSCRIPTION"],
    ["permission", "PERMISSION"],
  ])("classifies %s failures", (stage, kind) => {
    expect(
      classifyGuestPushFailure(
        new GuestWebPushStageError(stage, new Error("private")),
      ).kind,
    ).toBe(kind);
  });
  it("honors Retry-After and distinguishes pre-registration offline from uncertain commits", () => {
    expect(
      classifyGuestPushFailure(
        new GuestApiError({
          status: 429,
          code: "GUEST_ACCESS_RATE_LIMITED",
          message: "",
          retryAfter: 30,
        }),
      ),
    ).toEqual({ kind: "RATE_LIMITED", retryAfter: 30 });
    expect(
      classifyGuestPushFailure(
        new GuestApiError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "",
          isNetworkError: true,
        }),
      ).kind,
    ).toBe("OFFLINE");
    expect(
      classifyGuestPushFailure(
        new GuestApiError({
          status: 0,
          code: "MUTATION_OUTCOME_UNKNOWN",
          message: "",
          isNetworkError: true,
        }),
      ).kind,
    ).toBe("UNKNOWN");
  });
});
