import { describe, expect, it } from "vitest";

import {
  selectScopedValue,
  stampScope,
  type ScopedValue,
} from "../../lib/api/scoped-view";
import type { LiveOperationsPageData } from "./live-operations-controller";
import {
  createLiveOperationsController,
  type LiveOperationsController,
  type LiveOperationsSnapshot,
} from "./live-operations-controller";
import { page } from "./live-operations-controller-test-support";

/**
 * Cross-location visibility for /live-operations (D5-001 stale-paint
 * elimination).
 *
 * Drives the REAL controller wired exactly as `useLiveOperations` wires it:
 * emissions are stamped with the OWNING EFFECT's location (request-time
 * scope), and the view model is selected during render against the current
 * location. The decisive case is the render-to-effect window: an old
 * controller emission landing AFTER B was rendered still carries A's stamp
 * and can never be returned for B.
 */

const LOC_A = "11111111-1111-4111-8111-111111111111";
const LOC_B = "22222222-2222-4222-8222-222222222222";

function neutralSnapshot(): LiveOperationsSnapshot {
  return {
    error: null,
    items: [],
    loadingMore: false,
    moreError: false,
    nextCursor: null,
    observedAt: null,
    phase: "loading",
    refreshFailed: false,
    refreshing: false,
  };
}

interface PendingPage {
  resolve(page: LiveOperationsPageData): void;
  reject(error: unknown): void;
}

class ScopedHarness {
  scope: string | null = null;
  readonly emissions: Array<ScopedValue<LiveOperationsSnapshot>> = [];
  readonly pending: PendingPage[] = [];
  readonly controller: LiveOperationsController;

  constructor() {
    this.controller = createLiveOperationsController({
      fetcher: () =>
        new Promise((resolve, reject) => {
          this.pending.push({ resolve, reject });
        }),
      onChange: (snapshot) => {
        this.emissions.push(stampScope(this.scope, snapshot));
      },
    });
  }

  get latest(): ScopedValue<LiveOperationsSnapshot> {
    return this.emissions[this.emissions.length - 1]!;
  }
}

function viewUnder(
  harness: ScopedHarness,
  currentLocation: string | null,
): LiveOperationsSnapshot {
  return selectScopedValue(harness.latest, currentLocation, neutralSnapshot());
}

/** Lets queued microtasks (promise callbacks) settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("cross-location visibility: live-operations", () => {
  it("cannot render Location A rows once the selection is Location B", async () => {
    const harnessA = new ScopedHarness();
    // Step 1: A settles.
    harnessA.scope = LOC_A;
    harnessA.controller.load(LOC_A);
    harnessA.pending[0]!.resolve(page(["track-A"], null, "2026-01-01T10:00:00Z"));
    await tick();
    expect(viewUnder(harnessA, LOC_A).items.length).toBe(1);

    // Steps 2-4: selection becomes B; evaluating the view model BEFORE the
    // switch effect runs must yield B's loading posture — never A rows.
    const preEffect = viewUnder(harnessA, LOC_B);
    expect(preEffect.phase).toBe("loading");
    expect(preEffect.items).toEqual([]);
    expect(preEffect.observedAt).toBeNull();
  });

  it("keeps an old-controller emission inside the render-to-effect window hidden", async () => {
    const harnessA = new ScopedHarness();
    harnessA.scope = LOC_A;
    harnessA.controller.load(LOC_A);
    harnessA.pending[0]!.resolve(page(["track-A"], "c2", "2026-01-01T10:00:00Z"));
    await tick();

    // Selection is now B (render committed) but A's cleanup effect has not
    // run: a refresh re-request against the STILL-LIVE A controller lands
    // in this window and is stamped with A's effect closure.
    const beforeStraggler = harnessA.emissions.length;
    harnessA.controller.refresh();
    harnessA.pending[0]!.resolve(page(["track-A-late"], null, "2026-01-01T10:01:00Z"));
    await tick();
    expect(harnessA.emissions.length).toBeGreaterThan(beforeStraggler);

    // ...and it stays invisible under B.
    const underB = viewUnder(harnessA, LOC_B);
    expect(underB.items).toEqual([]);
  });

  it("renders B's own loading then ready states for B only", async () => {
    const harnessB = new ScopedHarness();
    harnessB.scope = LOC_B;
    harnessB.controller.load(LOC_B);

    // load(B) commits synchronously: B's loading posture is visible at once.
    expect(harnessB.latest.ownerId).toBe(LOC_B);
    expect(viewUnder(harnessB, LOC_B).phase).toBe("loading");
    expect(viewUnder(harnessB, LOC_B).items).toEqual([]);

    harnessB.pending[0]!.resolve(page(["track-B"], null, "2026-01-01T11:00:00Z"));
    await tick();
    const visible = viewUnder(harnessB, LOC_B);
    expect(visible.phase).toBe("ready");
    expect(visible.items[0]?.trackingSessionId).toBe("track-B");
  });
});
