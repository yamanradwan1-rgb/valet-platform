import { describe, expect, it } from "vitest";
import {
  EmergencyTakeoverIntent,
  limitEmergencyTakeoverReason,
  validEmergencyTakeoverReason,
} from "./emergency-takeover-intent";

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

  it("accepts 300 astral emoji as 300 codepoints even though UTF-16 length is 600", () => {
    const reason = "😀".repeat(300);
    expect(reason.length).toBe(600);
    expect(limitEmergencyTakeoverReason(reason)).toEqual({
      value: reason, exceeded: false, codepoints: 300,
    });
    expect(validEmergencyTakeoverReason(reason)).toBe(true);
    expect(new EmergencyTakeoverIntent().prepare({ ...base, reason })?.reason).toBe(reason);
  });

  it("limits pasted text to 500 complete codepoints and rejects unbounded direct intents", () => {
    const reason = "😀".repeat(501);
    const bounded = limitEmergencyTakeoverReason(reason);
    expect(bounded).toEqual({ value: "😀".repeat(500), exceeded: true, codepoints: 500 });
    expect(validEmergencyTakeoverReason(reason)).toBe(false);
    expect(new EmergencyTakeoverIntent().prepare({ ...base, reason })).toBeNull();
    expect(new EmergencyTakeoverIntent().prepare({ ...base, reason: bounded.value })?.reason).toBe(bounded.value);
    expect(limitEmergencyTakeoverReason("a".repeat(499) + "😀" + "b").value).toBe("a".repeat(499) + "😀");
  });

  it("rejects control characters after trimming", () => {
    expect(validEmergencyTakeoverReason("Reason\nAnother line")).toBe(false);
    expect(new EmergencyTakeoverIntent().prepare({ ...base, reason: "Reason\nAnother line" })).toBeNull();
  });
});
