import { describe, expect, it } from "vitest";

import { nativeReleaseBackBlocked } from "../src/handoff/native-release-protection";

describe("MOB-014B final release Back protection", () => {
  it.each(["ambiguous", "reconciling", "releasing"] as const)(
    "blocks Back while %s is unresolved",
    (phase) => expect(nativeReleaseBackBlocked(phase)).toBe(true),
  );
  it.each([
    "blocked",
    "conflict",
    "inactive",
    "loading",
    "ready",
    "released",
    "unavailable",
  ] as const)("allows Back from %s", (phase) =>
    expect(nativeReleaseBackBlocked(phase)).toBe(false),
  );
});
