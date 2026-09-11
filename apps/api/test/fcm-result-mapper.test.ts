import { describe, expect, it } from "vitest";

import {
  mapFcmResult,
  parseRetryAfter,
} from "../src/modules/staff-push/fcm-result-mapper";

const now = Date.parse("2026-09-11T12:00:00Z");
const fcmError = (errorCode: string, status = errorCode) => ({
  error: {
    details: [
      {
        "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
        errorCode,
      },
    ],
    status,
  },
});

function mapped(
  httpStatus: number,
  body: unknown,
  retryAfter: string | null = null,
  payloadProvenValid = true,
) {
  return mapFcmResult({
    body,
    httpStatus,
    nowMilliseconds: now,
    payloadProvenValid,
    retryAfter,
  });
}

describe("FCM HTTP v1 result mapping", () => {
  it("accepts only a well-formed success", () => {
    expect(mapped(200, { name: "projects/p/messages/1" })).toEqual({
      resultClass: "ACCEPTED",
    });
    expect(mapped(200, {})).toEqual({ resultClass: "UNKNOWN" });
  });

  it("maps conclusive endpoint invalidation without relying on HTTP alone", () => {
    expect(mapped(404, fcmError("UNREGISTERED"))).toEqual({
      resultClass: "INVALID_ENDPOINT",
    });
    expect(mapped(404, { error: { status: "NOT_FOUND" } })).toEqual({
      resultClass: "CONFIGURATION",
    });
  });

  it("distinguishes endpoint INVALID_ARGUMENT from payload violations", () => {
    expect(mapped(400, fcmError("INVALID_ARGUMENT"))).toEqual({
      resultClass: "INVALID_ENDPOINT",
    });
    expect(mapped(400, fcmError("INVALID_ARGUMENT"), null, false)).toEqual({
      resultClass: "PERMANENT",
    });
    expect(
      mapped(400, {
        error: {
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.BadRequest",
              fieldViolations: [{ field: "message.data" }],
            },
          ],
          status: "INVALID_ARGUMENT",
        },
      }),
    ).toEqual({ resultClass: "PERMANENT" });
  });

  it.each([
    [500, fcmError("INTERNAL"), "TRANSIENT"],
    [503, fcmError("UNAVAILABLE"), "TRANSIENT"],
    [401, { error: { status: "UNAUTHENTICATED" } }, "CONFIGURATION"],
    [403, fcmError("SENDER_ID_MISMATCH"), "CONFIGURATION"],
    [418, { nonsense: true }, "UNKNOWN"],
  ])("maps HTTP %i safely to %s", (httpStatus, body, resultClass) => {
    expect(mapped(httpStatus, body)).toEqual({ resultClass });
  });

  it("normalizes rate limiting and Retry-After", () => {
    expect(mapped(429, fcmError("QUOTA_EXCEEDED"), "45")).toEqual({
      resultClass: "RATE_LIMITED",
      retryAfterSeconds: 45,
    });
    expect(mapped(429, fcmError("QUOTA_EXCEEDED"), "broken")).toEqual({
      resultClass: "RATE_LIMITED",
    });
    expect(parseRetryAfter("Fri, 11 Sep 2026 12:00:30 GMT", now)).toBe(30);
  });
});
