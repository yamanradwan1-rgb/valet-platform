/**
 * Native telemetry OPERATION MAPPER tests (MOB-024A review Finding #1).
 *
 * The closed route-template mapper (native-http-operation.ts) must
 * attribute every real production route to a closed-table literal, must
 * never echo dynamic ids, query strings, or poisoned path material, and
 * must fall back to the bounded "other" literal for anything unmatched.
 *
 * Auth X-Request-Id correlation cases live in
 * native-telemetry-auth-correlation.test.ts; transport-level operation
 * cases live in native-telemetry-surfaces.test.ts. Split files respect
 * the 300-line authored-file ceiling in docs/17.
 */
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeHttpMethod,
  EmployeeTelemetryOperation,
} from "@valet/employee-client";

vi.mock("expo-application", () => ({
  get nativeApplicationVersion() {
    return "2.1.0";
  },
  get nativeBuildVersion() {
    return "321";
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return "android";
    },
  },
}));

const { nativeHttpTelemetryOperation } =
  await import("../src/telemetry/native-http-operation");

describe("HTTP telemetry operation mapper", () => {
  const U = "66666666-6666-6666-8666-666666666666";

  it("maps every real production route to its closed-table literal", () => {
    const cases: ReadonlyArray<
      readonly [EmployeeHttpMethod, string, EmployeeTelemetryOperation]
    > = [
      ["GET", "/v1/staff/operational-context", "operational-context"],
      ["GET", "/v1/staff/tasks/queue", "task-queue"],
      ["POST", `/v1/staff/tasks/${U}/assign`, "task-assign"],
      ["POST", `/v1/staff/tasks/${U}/accept`, "task-accept"],
      ["POST", "/v1/staff/shifts/start", "shift-start"],
      ["POST", `/v1/staff/shifts/${U}/end`, "shift-end"],
      ["GET", "/v1/staff/shifts/active", "shift-active-lookup"],
      ["GET", "/v1/staff/check-in/continuations", "check-in-continuations"],
      ["GET", "/v1/staff/check-in/drafts", "check-in-drafts"],
      ["POST", "/v1/staff/check-in/intakes", "check-in-intake"],
      [
        "POST",
        "/v1/staff/check-in/vehicle-recognition",
        "check-in-vehicle-recognition",
      ],
      ["POST", "/v1/staff/check-in/plate-ocr", "check-in-plate-ocr"],
      [
        "POST",
        `/v1/staff/check-in/sessions/${U}/complete`,
        "check-in-complete",
      ],
      [
        "PUT",
        `/v1/staff/check-in/sessions/${U}/vehicle-details`,
        "check-in-vehicle-details",
      ],
      [
        "PUT",
        `/v1/staff/check-in/sessions/${U}/vehicle-identity`,
        "check-in-vehicle-identity",
      ],
      [
        "POST",
        `/v1/staff/check-in/sessions/${U}/condition-notes`,
        "check-in-condition-note",
      ],
      [
        "POST",
        `/v1/staff/check-in/sessions/${U}/condition-completion`,
        "check-in-condition-completion",
      ],
      [
        "POST",
        `/v1/staff/check-in/sessions/${U}/guest-access/issue`,
        "guest-access",
      ],
      [
        "POST",
        `/v1/staff/check-in/sessions/${U}/guest-access/revoke`,
        "guest-access",
      ],
      ["GET", `/v1/staff/valet-sessions/${U}`, "valet-session-read"],
      ["GET", "/v1/staff/valet-sessions/directory", "valet-session-read"],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/parking-task/queue`,
        "parking-queue",
      ],
      ["POST", `/v1/staff/valet-sessions/${U}/start-parking`, "parking-start"],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/confirm-parked`,
        "parking-confirm",
      ],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/start-retrieval`,
        "retrieval-start",
      ],
      ["POST", `/v1/staff/valet-sessions/${U}/mark-ready`, "mark-ready"],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/initiate-handoff`,
        "handoff-initiate",
      ],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/verify-pickup-code`,
        "handoff-verify",
      ],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/verify-dynamic-qr`,
        "handoff-verify",
      ],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/supervisor-override-handoff`,
        "handoff-override",
      ],
      ["POST", `/v1/staff/valet-sessions/${U}/abort-handoff`, "handoff-abort"],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/complete-handoff`,
        "release-complete",
      ],
      [
        "GET",
        `/v1/staff/valet-sessions/${U}/payment`,
        "release-payment-status",
      ],
      ["POST", `/v1/staff/valet-sessions/${U}/incidents`, "incident-report"],
      [
        "GET",
        `/v1/staff/valet-sessions/${U}/incidents/${U}/recovery`,
        "incident-recovery",
      ],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/incidents/${U}/recovery-intent`,
        "incident-recovery",
      ],
      [
        "POST",
        `/v1/staff/valet-sessions/${U}/incidents/${U}/recovery-intent/retire`,
        "incident-recovery",
      ],
      ["PUT", "/v1/staff/push/registrations", "push-registration"],
    ];
    for (const [method, path, expected] of cases) {
      expect(
        nativeHttpTelemetryOperation({ method, path }),
        `${method} ${path}`,
      ).toBe(expected);
    }
  });

  it("routes auth paths and unknown/poisoned paths to the bounded fallback", () => {
    // Auth routes are the auth transport's surface, not HTTP operations.
    expect(
      nativeHttpTelemetryOperation({
        method: "POST",
        path: "/v1/staff/auth/native/login",
      }),
    ).toBe("other");
    expect(
      nativeHttpTelemetryOperation({
        method: "POST",
        path: "/v1/staff/auth/native/refresh",
      }),
    ).toBe("other");
    expect(
      nativeHttpTelemetryOperation({ method: "GET", path: "/totally/unknown" }),
    ).toBe("other");
    // Traversal and header-injection material can never become a literal.
    expect(
      nativeHttpTelemetryOperation({
        method: "GET",
        path: "/v1/staff/../../../etc/passwd",
      }),
    ).toBe("other");
    expect(
      nativeHttpTelemetryOperation({
        method: "POST",
        path: "/v1/staff/tasks/queue/SET-COOKIE: leak",
      }),
    ).toBe("other");
    // Query strings never affect the static template and are not echoed.
    expect(
      nativeHttpTelemetryOperation({
        method: "GET",
        path: "/v1/staff/tasks/queue?x=secret&y=1",
      }),
    ).toBe("task-queue");
    // The wrong METHOD on a known template is unmatched, not force-fit.
    expect(
      nativeHttpTelemetryOperation({
        method: "DELETE",
        path: "/v1/staff/tasks/queue",
      }),
    ).toBe("other");
  });

  it("never echoes dynamic ids or query material from the mapped literal", () => {
    const operation = nativeHttpTelemetryOperation({
      method: "POST",
      path: `/v1/staff/valet-sessions/${U}/start-parking?x=secret&y=1`,
    });
    expect(operation).toBe("parking-start");
    expect(operation).not.toContain(U);
    expect(operation).not.toContain("secret");
  });
});
