import { describe, expect, it } from "vitest";

import { selectScopedValue, stampScope } from "./scoped-view";

/**
 * Semantic contract of the shared identity-aware scope selector (D5-001).
 *
 * Every location-owned dashboard read surface derives what its view may see
 * through this selector: a snapshot is renderable ONLY while the scope it
 * was stamped with at REQUEST time equals the CURRENTLY selected location.
 * Anything else collapses to the surface's neutral loading posture,
 * synchronously during render — before any effect can run.
 */

interface Probe {
  readonly label: string;
}

const NEUTRAL: Probe = { label: "<neutral>" };

describe("selectScopedValue", () => {
  it("returns the identical value while its stamp matches the current scope", () => {
    const value: Probe = { label: "A-data" };
    const scoped = stampScope("loc-A", value);
    expect(selectScopedValue(scoped, "loc-A", NEUTRAL)).toBe(value);
  });

  it("collapses a previous-location value to neutral under the new location", () => {
    const scoped = stampScope("loc-A", { label: "A-data" });
    expect(selectScopedValue(scoped, "loc-B", NEUTRAL)).toBe(NEUTRAL);
  });

  it("never exposes an unscoped value", () => {
    const scoped = stampScope(null, { label: "orphan" });
    expect(selectScopedValue(scoped, "loc-A", NEUTRAL)).toBe(NEUTRAL);
    expect(selectScopedValue(scoped, null, NEUTRAL)).toBe(NEUTRAL);
  });

  it("never matches an absent current selection", () => {
    const scoped = stampScope("loc-A", { label: "A-data" });
    expect(selectScopedValue(scoped, null, NEUTRAL)).toBe(NEUTRAL);
  });

  it("follows re-stamping: B writes become visible and later A writes stay hidden", () => {
    const underA = stampScope("loc-A", { label: "A-data" });
    // Selection moved to B: A collapses...
    expect(selectScopedValue(underA, "loc-B", NEUTRAL)).toBe(NEUTRAL);
    // ...B's own write becomes visible...
    const underB = stampScope("loc-B", { label: "B-data" });
    expect(selectScopedValue(underB, "loc-B", NEUTRAL).label).toBe("B-data");
    // ...and a straggler stamped A remains hidden.
    expect(selectScopedValue(underA, "loc-B", NEUTRAL)).toBe(NEUTRAL);
  });
});

describe("stampScope", () => {
  it("records the owner without cloning or mutating the value", () => {
    const value: Probe = { label: "shared" };
    const scoped = stampScope("loc-A", value);
    expect(scoped.value).toBe(value);
    expect(scoped.ownerId).toBe("loc-A");
  });
});
