import { describe, expect, it } from "vitest";
import { EmergencyTakeoverIntent } from "./emergency-takeover-intent";

const base = {
  taskId: "11111111-1111-4111-8111-111111111111",
  expectedVersion: 7,
  targetAssigneeMembershipId: "22222222-2222-4222-8222-222222222222",
  reason: "Vehicle recovery",
};

describe("Emergency Task Takeover intent identity", () => {
  it("reuses the operation ID for an identical authorized retry", () => {
    const intent = new EmergencyTakeoverIntent();
    const first = intent.prepare(base);
    expect(first).not.toBeNull();
    expect(intent.prepare({ ...base, reason: "  Vehicle recovery  " })).toEqual(first);
  });

  it("uses a different operation ID for changed task/version/target/reason", () => {
    const intent = new EmergencyTakeoverIntent();
    const first = intent.prepare(base)!;
    const changed = [
      { ...base, taskId: "33333333-3333-4333-8333-333333333333" },
      { ...base, expectedVersion: 8 },
      { ...base, targetAssigneeMembershipId: "44444444-4444-4444-8444-444444444444" },
      { ...base, reason: "Different recovery" },
    ];
    for (const next of changed) {
      const result = intent.prepare(next)!;
      expect(result.operationId).not.toBe(first.operationId);
    }
  });

  it("resets identity after an authoritative refresh and rejects blank reasons", () => {
    const intent = new EmergencyTakeoverIntent();
    const first = intent.prepare(base)!;
    intent.reset();
    expect(intent.prepare(base)!.operationId).not.toBe(first.operationId);
    expect(intent.prepare({ ...base, reason: "  " })).toBeNull();
  });
});
