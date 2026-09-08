import { describe, expect, it } from "vitest";

import { nativeHandoffBackBlocked } from "../src/handoff/native-handoff-protection";

describe("MOB-014A handoff Back protection", () => {
  it.each([
    "aborting",
    "initiating",
    "overriding",
    "reconciling",
    "verifying",
  ] as const)("blocks Back while %s is unresolved", (phase) =>
    expect(nativeHandoffBackBlocked(phase)).toBe(true),
  );
  it.each([
    "ambiguous",
    "conflict",
    "inactive",
    "loading",
    "pending",
    "ready",
    "unavailable",
    "verified",
  ] as const)(
    "allows Back from %s after ephemeral input can be purged",
    (phase) => expect(nativeHandoffBackBlocked(phase)).toBe(false),
  );
});
