import { describe, expect, it } from "vitest";

import { nativeRetrievalBackBlocked } from "../src/retrieval/native-retrieval-protection";

describe("MOB-013 retrieval back protection", () => {
  it.each(["submitting-start", "submitting-ready", "reconciling"] as const)(
    "blocks Back while the protected %s operation is unresolved",
    (phase) => {
      expect(nativeRetrievalBackBlocked(phase)).toBe(true);
    },
  );

  it.each([
    "key-checkout",
    "retrieving",
    "ready",
    "conflict",
    "ambiguous",
    "assigned",
    "inactive",
    "loading",
    "unavailable",
  ] as const)("allows Back from the %s stage", (phase) => {
    expect(nativeRetrievalBackBlocked(phase)).toBe(false);
  });
});
