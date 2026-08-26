import { describe, expect, it } from "vitest";

import {
  selectScopedValue,
  stampScope,
  type ScopedValue,
} from "../../lib/api/scoped-view";
import { createCursorListEngine } from "./cursor-list-engine";
import {
  createIdleCursorListState,
  type CursorListState,
} from "./cursor-list-state";

/**
 * Cross-location visibility for the three overview cursor surfaces
 * (D5-001 stale-paint elimination): /active-shifts, /keys and /incidents.
 *
 * Drives the REAL framework-free engine (`createCursorListEngine`) wired
 * exactly as `useOverviewCursorList` wires it: emissions are stamped with
 * the ACTIVE scope (updated only by the scope effect), and the view model
 * is selected during render against the current location. Proven here,
 * deterministically:
 * - a settled Location A list cannot be returned once B is selected;
 * - a late A response landing inside the render-to-effect window stays
 *   A-stamped and invisible;
 * - B's own loading and ready states become visible as soon as B's effect
 *   owns the scope.
 */

const SURFACES = ["active-shifts", "keys", "incidents"] as const;
const LOC_A = "11111111-1111-4111-8111-111111111111";
const LOC_B = "22222222-2222-4222-8222-222222222222";
const IDLE = createIdleCursorListState<number>();

/** Lets queued microtasks (promise callbacks) settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface PendingPage {
  resolve(page: { items: number[]; nextCursor: string | null }): void;
}

function makeHarness() {
  const emissions: Array<ScopedValue<CursorListState<number>>> = [];
  const pending: PendingPage[] = [];
  // Wired EXACTLY like useOverviewCursorList: the engine owns the scope and
  // passes it with every emission; the adapter only stamps and stores.
  const engine = createCursorListEngine<number>({
    fetchPage: () =>
      new Promise((resolve) => {
        pending.push({ resolve });
      }),
    onState: (state, owner) => emissions.push(stampScope(owner, state)),
  });
  return {
    engine,
    setScope: (value: string | null) => {
      engine.syncOwner(value);
    },
    get latest(): ScopedValue<CursorListState<number>> {
      return emissions[emissions.length - 1]!;
    },
    emissionCount: (): number => emissions.length,
    settleNext(page: { items: number[]; nextCursor: string | null }): void {
      pending[pending.length - 1]!.resolve(page);
    },
  };
}

describe.each(SURFACES)("cross-location visibility: %s", (surface) => {
  it(`${surface}: cannot render Location A rows once B is selected`, async () => {
    const harness = makeHarness();
    // Step 1: A settles under the active A scope.
    harness.setScope(LOC_A);
    harness.engine.reset();
    harness.engine.load();
    harness.settleNext({ items: [11], nextCursor: null });
    await tick();
    expect(harness.latest.value.status).toBe("ready");
    expect(harness.latest.value.items).toEqual([11]);
    expect(harness.latest.ownerId).toBe(LOC_A);

    // Steps 2-4: selection becomes B; evaluating the view model BEFORE any
    // reset effect runs must yield the neutral idle posture — never A.
    const preEffectView = selectScopedValue(harness.latest, LOC_B, IDLE);
    expect(preEffectView.status).toBe("idle");
    expect(preEffectView.items).toEqual([]);
  });

  it(`${surface}: keeps a late in-flight A response hidden after the switch`, async () => {
    const harness = makeHarness();
    harness.setScope(LOC_A);
    harness.engine.reset();
    harness.engine.load();

    // The switch: B renders, then the scope effect re-stamps and resets.
    harness.setScope(LOC_B);
    harness.engine.reset();
    const afterResetCount = harness.emissionCount();

    // The straggler A response lands NOW; the engine drops it entirely...
    harness.settleNext({ items: [99], nextCursor: null });
    await tick();
    expect(harness.emissionCount()).toBe(afterResetCount);

    // ...and even a publish carrying A's stamp stays invisible under B.
    const underB = selectScopedValue(harness.latest, LOC_B, IDLE);
    expect(underB.items).toEqual([]);
  });

  it(`${surface}: renders B's own loading then ready states for B only`, async () => {
    const harness = makeHarness();
    harness.setScope(LOC_B);
    harness.engine.reset();
    harness.engine.load();
    expect(harness.latest.ownerId).toBe(LOC_B);
    expect(selectScopedValue(harness.latest, LOC_B, IDLE).status).toBe(
      "loading",
    );
    harness.settleNext({ items: [22], nextCursor: null });
    await tick();
    const visible = selectScopedValue(harness.latest, LOC_B, IDLE);
    expect(visible.status).toBe("ready");
    expect(visible.items).toEqual([22]);
  });
});
