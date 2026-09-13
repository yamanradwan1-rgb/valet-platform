/**
 * Independent ADVERSARIAL sanitizer tests (MOB-024A) — written by the
 * adversarial reviewer from the Phase-1 review, deliberately using angles
 * NOT covered by worker_2's native-telemetry*.test.ts suites.
 *
 * This file: FORMAT-LEVEL FUZZING of the portable sanitizing boundary
 * (`createEmployeeTelemetryEvent` from @valet/employee-client). Serialized
 * JSON of every produced event is scanned for forbidden material — auth
 * material, plate text, pickup codes, proof tokens, image base64, header
 * syntax, entity IDs, unicode/RTL payloads — under fuzzed key spellings,
 * nested objects, arrays, and prototype-pollution shapes.
 *
 * Business-preservation and ring-bound adversarial cases live in
 * native-telemetry-business-preservation.test.ts (split for the 300-line
 * authored-file ceiling in docs/17).
 */
import { describe, expect, it } from "vitest";
import { createEmployeeTelemetryEvent } from "@valet/employee-client";

const FORBIDDEN_MATERIAL: ReadonlyArray<{ label: string; value: string }> = [
  { label: "bearer-header", value: "Bearer x" },
  { label: "authorization-header", value: "Authorization: Bearer eyJhbGci" },
  { label: "access-token", value: "vsa1.access-token-secret-123" },
  { label: "refresh-token", value: "refresh-token-secret-456" },
  { label: "pickup-code", value: "1234" },
  { label: "pickup-code-labeled", value: "pickup code 1234" },
  { label: "dynamic-qr-proof", value: "qrv1-PROOF-c29tZS1zZWNyZXQ" },
  { label: "guest-bearer", value: "guest_bearer_1a2b3c4d5e" },
  { label: "payment-secret", value: "sk_test_payment_secret_9f8e" },
  { label: "card-pan", value: "4111111111111111" },
  { label: "plate-text", value: "ABC-1234" },
  { label: "plate-text-compact", value: "ABC1234" },
  { label: "image-base64-chunk", value: "/9j/4AAQSkZJRgABAQAAAQABAAD" },
  { label: "image-base64-header", value: "data:image/jpeg;base64," },
  { label: "raw-provider-secret", value: "provider-secret-zzz" },
  { label: "header-syntax", value: "X-Internal-Code: 99" },
  { label: "entity-id", value: "44444444-4444-4444-8444-444444444444" },
  { label: "free-text", value: "customer says the car is scratched" },
  { label: "arabic-rtl-payload", value: "طلب-سري-123" },
  { label: "zero-width-joiner", value: "token\u200bhidden" },
  { label: "cookie-injection", value: "SET-COOKIE: session=leak" },
  { label: "log-forging", value: "1 operation=OUTCOME-HACK" },
  { label: "path-traversal", value: "../../etc/passwd" },
];

/** Fuzzed key spellings an attacker might try for the same slots. */
const FUZZED_KEYS = [
  "requestId",
  "request_id",
  "RequestID",
  "requestID",
  "idempotencyKey",
  "operationId",
  "X-Request-Id",
  "x-request-id",
  "correlationId",
  "traceId",
  "__proto__",
  "constructor",
  "toString",
  "body",
  "payload",
  "headers",
  "Authorization",
  "accessToken",
  "refreshToken",
  "password",
  "pickupCode",
  "proof",
  "plate",
  "image",
  "metadata",
  "tags",
  "extras",
];

type FactoryInput = Parameters<typeof createEmployeeTelemetryEvent>[0];

function assertSerializedContainsNothingForbidden(
  event: ReturnType<typeof createEmployeeTelemetryEvent>,
): void {
  const serialized = JSON.stringify(event ?? { absent: true });
  for (const material of FORBIDDEN_MATERIAL) {
    expect(serialized, `leaked via ${material.label}`).not.toContain(
      material.value,
    );
  }
}

describe("adversarial: format-level sanitization fuzzing", () => {
  it("every classification slot in the closed table rejects poisoned material", () => {
    const sources = [
      "auth",
      "http",
      "lifecycle",
      "network",
      "ocr",
      "push",
      "recovery",
    ] as const;
    for (const source of sources) {
      for (const material of FORBIDDEN_MATERIAL) {
        expect(
          createEmployeeTelemetryEvent({
            classification: material.value,
            outcome: "error",
            source,
          }),
          `${source} / ${material.label}`,
        ).toBeUndefined();
      }
    }
  });

  it("fuzzed key spellings can never smuggle material into an event", () => {
    for (const key of FUZZED_KEYS) {
      const poisoned: Record<string, unknown> = {
        classification: "response",
        outcome: "success",
        source: "http",
      };
      for (const material of FORBIDDEN_MATERIAL) {
        poisoned[`${key}:${material.label}`] = material.value;
      }
      poisoned[key] = FORBIDDEN_MATERIAL.map((m) => m.value).join(" ");
      const event = createEmployeeTelemetryEvent(
        poisoned as unknown as FactoryInput,
      );
      expect(event).toBeDefined();
      // Exactly the contract keys survive — no fuzzed alias ever lands.
      expect(Object.keys(event ?? {}).sort()).toEqual([
        "classification",
        "outcome",
        "source",
      ]);
      assertSerializedContainsNothingForbidden(event);
    }
  });

  it("nested objects and arrays cannot smuggle material through slots", () => {
    const nested = {
      classification: "response",
      errorCode: {
        code: "Bearer x",
        nested: { deeper: { Authorization: "Bearer eyJhbGci" } },
      },
      outcome: "success",
      requestId: ["pickup code 1234", { plate: "ABC-1234" }],
      source: "http",
    };
    const event = createEmployeeTelemetryEvent(
      nested as unknown as FactoryInput,
    );
    expect(event).toEqual({
      classification: "response",
      outcome: "success",
      source: "http",
    });
    assertSerializedContainsNothingForbidden(event);
  });

  it("prototype-pollution-shaped events are sanitized, never merged", () => {
    const attempt = JSON.parse(
      JSON.stringify({
        __proto__: { polluted: "Bearer x" },
        classification: "match",
        outcome: "success",
        source: "ocr",
      }),
    ) as Record<string, unknown>;
    const event = createEmployeeTelemetryEvent(
      attempt as unknown as FactoryInput,
    );
    expect(event).toBeDefined();
    expect(Object.keys(event ?? {})).not.toContain("__proto__");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    assertSerializedContainsNothingForbidden(event);
  });

  it("oversized request ids and error codes are dropped wholesale", () => {
    const hugeId = `${"x".repeat(120)} with a space and \n newline`;
    const event = createEmployeeTelemetryEvent({
      classification: "response",
      durationMs: 1,
      errorCode: hugeId,
      outcome: "error",
      requestId: hugeId,
      source: "http",
    });
    expect(event?.requestId).toBeUndefined();
    expect(event?.errorCode).toBeUndefined();
    assertSerializedContainsNothingForbidden(event);
  });

  it("a valid event round-trips clean JSON with only contract fields", () => {
    const event = createEmployeeTelemetryEvent({
      classification: "response",
      durationMs: 7,
      errorCode: "GUEST_ACCESS_INVALID",
      outcome: "error",
      requestId: "req-47",
      source: "http",
    });
    expect(event).toBeDefined();
    // Parsed-object equality: exact fields, exact values, nothing more.
    expect(JSON.parse(JSON.stringify(event))).toEqual({
      classification: "response",
      durationMs: 7,
      errorCode: "GUEST_ACCESS_INVALID",
      outcome: "error",
      requestId: "req-47",
      source: "http",
    });
    assertSerializedContainsNothingForbidden(event);
  });
});
