import { describe, expect, it } from "vitest";

import {
  emptyCursorList,
  initialLoadFailed,
  initialPageLoaded,
  pageAppended,
} from "./cursor-list-reducer";
import { selectScopedValue, stampScope } from "./scoped-view";

/**
 * Cross-location visibility for the three shared-cursor surfaces
 * (D5-001 stale-paint elimination): /sessions, /retrieval-queue and /tasks
 * all consume `useCursorList`, whose state resets in an EFFECT. These tests
 * prove the render-time collapse contract those hooks now apply: snapshots
 * are stamped with their request-time location, and selecting under the
 * CURRENT location returns the neutral loading posture for anything not
 * produced by it — deterministically, before any effect runs.
 *
 * The reducers used here are the exact production transitions the hook
 * applies; late-response SUPPRESSION itself remains pinned by the existing
 * sequencing suites — these tests prove that even a publish that slipped
 * through would stay invisible under the wrong location.
 */

const SURFACES = ["sessions", "retrieval-queue", "tasks"] as const;
const LOC_A = "11111111-1111-4111-8111-111111111111";
const LOC_B = "22222222-2222-4222-8222-222222222222";
const keyOf = (item: string): string => item;

describe.each(SURFACES)("cross-location visibility: %s", (surface) => {
  it("cannot render Location A rows once the selection is Location B", () => {
    // Step 1: A has settled (exact production reducer chain).
    const settledA = stampScope(
      LOC_A,
      initialPageLoaded({ items: [`${surface}-A-1`], nextCursor: "c2" }, keyOf),
    );
    expect(settledA.value.items).toEqual([`${surface}-A-1`]);

    // Steps 2-4: the selection becomes B; the very same render evaluates
    // the view model BEFORE any reset effect — A must not be returned.
    const underB = selectScopedValue(settledA, LOC_B, emptyCursorList<string>());
    expect(underB.phase).toBe("loading");
    expect(underB.items).toEqual([]);
    expect(underB.nextCursor).toBeNull();
  });

  it("keeps a late Location A page hidden after the switch", () => {
    const settledA = stampScope(
      LOC_A,
      initialPageLoaded({ items: [`${surface}-A-1`], nextCursor: "c2" }, keyOf),
    );
    // Even a publish that slips through carries A's request-time stamp...
    const lateA = stampScope(
      LOC_A,
      pageAppended(
        settledA.value,
        { items: [`${surface}-A-2`], nextCursor: null },
        keyOf,
      ),
    );
    // ...and stays invisible under B.
    const underB = selectScopedValue(lateA, LOC_B, emptyCursorList<string>());
    expect(underB.items).toEqual([]);
  });

  it("renders B's own settled payload once B stamps it", () => {
    const settledB = stampScope(
      LOC_B,
      initialPageLoaded({ items: [`${surface}-B-1`], nextCursor: null }, keyOf),
    );
    const visible = selectScopedValue(
      settledB,
      LOC_B,
      emptyCursorList<string>(),
    );
    expect(visible.phase).toBe("ready");
    expect(visible.items).toEqual([`${surface}-B-1`]);
  });

  it("hides a previous-location load failure like its successes", () => {
    const failedA = stampScope(LOC_A, initialLoadFailed<string>());
    const underB = selectScopedValue(failedA, LOC_B, emptyCursorList<string>());
    expect(underB.phase).toBe("loading");
  });
});
