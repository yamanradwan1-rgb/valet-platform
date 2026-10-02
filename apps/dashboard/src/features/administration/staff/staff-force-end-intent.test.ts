import { describe, expect, it } from "vitest";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { ForceEndIntent, forceEndFailure } from "./staff-force-end-intent";

describe("Force End operation identity", () => {
  it("allocates only for valid confirmation and reason, retaining normalized Unicode material", () => {
    const intent = new ForceEndIntent();
    expect(intent.submit("org", "shift", "  ", true)).toBeNull();
    expect(intent.submit("org", "shift", "سبب", false)).toBeNull();
    expect(intent.submit("org", "shift", "x".repeat(501), true)).toBeNull();
    const first = intent.submit("org", "shift", "  سبب 🅰️  ", true)!;
    expect(first.reason).toBe("سبب 🅰️");
    expect(first.confirmation).toBe("FORCE_END_SHIFT");
    expect(intent.submit("org", "shift", first.reason, true)).toEqual(first);
    expect(
      intent.submit("org", "shift", "changed", true)!.operationId,
    ).not.toBe(first.operationId);
  });
  it("separates targets/organizations and retires success or edited confirmation material", () => {
    const intent = new ForceEndIntent();
    const first = intent.submit("a", "x", "reason", true)!;
    expect(intent.submit("a", "y", "reason", true)!.operationId).not.toBe(
      first.operationId,
    );
    expect(intent.submit("b", "x", "reason", true)!.operationId).not.toBe(
      first.operationId,
    );
    intent.reset();
    expect(intent.submit("a", "x", "reason", true)!.operationId).not.toBe(
      first.operationId,
    );
    intent.restore("a", "x", "reason", first.operationId);
    expect(intent.submit("a", "x", "reason", true)).toEqual(first);
  });
});

describe("Force End safe failure states", () => {
  it.each([
    ["mfa", "MFA_STEP_UP_REQUIRED", "mfa"],
    ["auth", "AUTH_RECONCILED_RETRY_REQUIRED", "retry"],
    ["network", "NETWORK_ERROR", "unknown"],
    ["malformed", "MALFORMED_RESPONSE", "unknown"],
    ["conflict", "OPEN_TASK_HANDOFF_REQUIRED", "blocked"],
    ["conflict", "SHIFT_ALREADY_ENDED", "ended-conflict"],
    ["conflict", "IDEMPOTENCY_CONFLICT", "conflict"],
    ["authorization", "AUTHORIZATION_DENIED", "denied"],
    ["entitlement", "DASHBOARD_ACCESS_DENIED", "denied"],
    ["validation", "VALIDATION_FAILED", "failed"],
  ] as const)("%s / %s is %s", (kind, code, phase) => {
    expect(
      forceEndFailure(
        new DashboardApiError({ kind, code, message: "private detail" }),
      ),
    ).toBe(phase);
  });
  it("treats an unreadable unexpected transport boundary conservatively", () => {
    expect(forceEndFailure(new Error("never display this payload"))).toBe(
      "unknown",
    );
  });
});
