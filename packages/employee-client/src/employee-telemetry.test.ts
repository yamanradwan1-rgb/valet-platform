import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_TELEMETRY_CLASSIFICATIONS,
  createEmployeeTelemetryEvent,
  isValidEmployeeTelemetryClassification,
} from "./employee-telemetry-classification";
import {
  isSafeTelemetryRequestId,
  type EmployeeTelemetrySource,
} from "./employee-telemetry-types";

const CONTRACT_KEYS = [
  "classification",
  "durationMs",
  "errorCode",
  "outcome",
  "requestId",
  "source",
] as const;
const BANNED = [
  "Bearer",
  "Authorization",
  "passwd",
  "password",
  "hunter2",
  "script",
  "SET-COOKIE",
  "leak",
  "secret",
  "ABC1234",
  "abc def",
];
const ALL_PAIRS = (
  Object.keys(EMPLOYEE_TELEMETRY_CLASSIFICATIONS) as EmployeeTelemetrySource[]
).flatMap((source) =>
  EMPLOYEE_TELEMETRY_CLASSIFICATIONS[source].map(
    (classification) => [source, classification] as const,
  ),
);
const ADVERSARIAL = [
  "Bearer abc123",
  "../../etc/passwd",
  "Authorization: Bearer x",
  "SET-COOKIE: session=leak",
  "password=hunter2",
  "ABC1234",
  "<script>alert(document.cookie)</script>",
];
const UNSAFE_IDS = [
  "",
  "x".repeat(129),
  "abc def",
  "abc\ndef",
  "SET-COOKIE: 1",
  "Authorization: Bearer x",
  "../../etc/passwd",
  "a/b",
  "a:b",
  "a;b",
  "a=b",
  "Bearer token",
  null,
  undefined,
  123,
  {},
];

describe("closed classification vocabulary", () => {
  it.each(ALL_PAIRS)("accepts listed pair %s/%s", (source, classification) => {
    expect(isValidEmployeeTelemetryClassification(source, classification)).toBe(
      true,
    );
  });
  it.each([
    ...ADVERSARIAL.map((classification) => ["ocr", classification] as const),
    ["http", "telemetry-hack"],
    ["http", ""],
    ["lifecycle", "ABC1234"], // plate (business input) as classification
    ["auth", "pickup-code 4-digit"],
    ["push", "registration-confirmed "],
    ["http", "login"], // cross-source leakage
    ["auth", "offline"],
  ] as const)("rejects unknown %s/%s", (source, classification) => {
    expect(isValidEmployeeTelemetryClassification(source, classification)).toBe(
      false,
    );
  });
  it("rejects unknown sources", () => {
    expect(
      isValidEmployeeTelemetryClassification(
        "not-a-source" as EmployeeTelemetrySource,
        "login",
      ),
    ).toBe(false);
  });
});

describe("isSafeTelemetryRequestId", () => {
  it.each(["a", "req-1", "A.b_c-d", "0", "x".repeat(128)])(
    "accepts %s",
    (v) => {
      expect(isSafeTelemetryRequestId(v)).toBe(true);
    },
  );
  it.each(UNSAFE_IDS)("rejects %s", (v) => {
    expect(isSafeTelemetryRequestId(v)).toBe(false);
  });
});

describe("createEmployeeTelemetryEvent", () => {
  it("round-trips a fully valid event with exact contract keys", () => {
    const event = createEmployeeTelemetryEvent({
      source: "http",
      classification: "response",
      outcome: "success",
      requestId: "req-1.2_3",
      errorCode: "API_ERROR",
      durationMs: 42,
    });
    expect(event).toEqual({
      classification: "response",
      durationMs: 42,
      errorCode: "API_ERROR",
      outcome: "success",
      requestId: "req-1.2_3",
      source: "http",
    });
    expect(Object.keys(event ?? {}).sort()).toEqual([...CONTRACT_KEYS].sort());
  });
  it.each([
    {
      source: "auth" as const,
      classification: "Bearer abc123",
      outcome: "error" as const,
    },
    {
      source: "ocr" as const,
      classification: "ABC1234",
      outcome: "error" as const,
    },
    ...ADVERSARIAL.map((classification) => ({
      source: "recovery" as const,
      classification,
      outcome: "error" as const,
    })),
    {
      source: "finance" as EmployeeTelemetrySource,
      classification: "login",
      outcome: "error" as const,
    },
    {
      source: "auth" as const,
      classification: "login",
      outcome: "catastrophe" as never,
    },
  ] as const)("returns undefined for invalid input %j", (input) => {
    expect(createEmployeeTelemetryEvent(input)).toBeUndefined();
  });
  it("omits unsafe requestIds/errorCodes (documented: drop, not reject)", () => {
    for (const requestId of UNSAFE_IDS.filter((v) => typeof v === "string")) {
      const event = createEmployeeTelemetryEvent({
        source: "http",
        classification: "response",
        outcome: "error",
        requestId,
        errorCode: "password=hunter2",
      });
      expect(event).toBeDefined();
      expect(event?.requestId).toBeUndefined();
      expect(event?.errorCode).toBeUndefined();
      expect(Object.keys(event ?? {})).not.toContain("requestId");
      expect(Object.keys(event ?? {})).not.toContain("errorCode");
      const serialized = JSON.stringify(event);
      expect(serialized).not.toMatch(/SET-COOKIE/i);
      expect(serialized).not.toContain("hunter2");
    }
  });
  it.each([-1, Number.NaN, Infinity, -Infinity])(
    "omits non-finite or negative duration %p",
    (durationMs) => {
      const event = createEmployeeTelemetryEvent({
        source: "ocr",
        classification: "timeout",
        outcome: "error",
        durationMs,
      });
      expect(event).toBeDefined();
      expect(event?.durationMs).toBeUndefined();
    },
  );
  it("keeps zero as a legitimate duration", () => {
    const event = createEmployeeTelemetryEvent({
      source: "ocr",
      classification: "timeout",
      outcome: "success",
      durationMs: 0,
    });
    expect(event?.durationMs).toBe(0);
  });
  it("never emits properties beyond the documented contract keys", () => {
    const adversarial = createEmployeeTelemetryEvent({
      source: "recovery",
      classification: "found",
      outcome: "success",
      requestId: "req-1",
      errorCode: "SOME_CODE",
      durationMs: 5,
      ...({ token: "secret", body: "leak", plate: "ABC1234" } as Record<
        string,
        unknown
      >),
    });
    expect(adversarial).toBeDefined();
    expect(Object.keys(adversarial ?? {}).sort()).toEqual(
      [...CONTRACT_KEYS].sort(),
    );
    for (const banned of BANNED) {
      expect(JSON.stringify(adversarial)).not.toContain(banned);
    }
  });
});
