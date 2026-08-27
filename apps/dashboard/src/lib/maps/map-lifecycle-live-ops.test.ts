/**
 * D6-004A — MapController lifecycle QA (part 3 of 3).
 *
 * Live Operations established-viewport pattern: pending fallback, the
 * pending -> established transition, location switching, and the
 * "B never borrows A's established viewport" invariant.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMapController,
  type MapController,
} from "./map-lifecycle";
import {
  globalState,
  type MockMap,
  MockMapProviderAdapter,
  resetGlobalState,
} from "../../features/map-setup/setup-map.test-double";

function makeContainer(): HTMLElement {
  return {
    addEventListener: (): void => undefined,
    appendChild: (child: unknown): unknown => child,
    childNodes: [],
    dispatchEvent: (): boolean => true,
    nodeName: "DIV",
    nodeType: 1,
    ownerDocument: null,
    removeChild: (child: unknown): unknown => child,
    removeEventListener: (): void => undefined,
    tagName: "DIV",
  } as unknown as HTMLElement;
}

interface Harness {
  controller: MapController;
  adapter: MockMapProviderAdapter;
}

function makeHarness(): Harness {
  const adapter = new MockMapProviderAdapter();
  const controller = createMapController({
    adapter,
    getContainer: () => makeContainer(),
  });
  return { adapter, controller };
}

function expectCreated(decision: unknown): MockMap {
  if (
    !decision ||
    typeof decision !== "object" ||
    (decision as { kind?: string }).kind !== "create"
  ) {
    throw new Error(`expected create decision, got ${String(decision)}`);
  }
  return (decision as { instance: MockMap }).instance;
}

beforeEach(() => {
  resetGlobalState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MapController — Live Operations established-viewport pattern", () => {
  it("stays on the world fallback when the key remains the empty fallback", async () => {
    const harness = makeHarness();
    const worldKey = "loc-A|pending|0.000000|0.000000|1";
    const first = await harness.controller.ensure(worldKey, {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    expect(first.kind).toBe("create");

    const second = await harness.controller.ensure(worldKey, {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    expect(second.kind).toBe("reuse");
    expect(globalState.createdCount).toBe(1);

    harness.controller.dispose();
  });

  it("transitions from pending to set when the viewport suffix changes", async () => {
    const harness = makeHarness();
    const pending = "loc-A|pending|0.000000|0.000000|1";
    const established = "loc-A|set|31.950000|35.880000|17";
    await harness.controller.ensure(pending, {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });

    const establishedDecision = await harness.controller.ensure(established, {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    expect(establishedDecision.kind).toBe("create");
    expect(harness.controller.currentKey).toBe(established);

    const follow = await harness.controller.ensure(established, {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    expect(follow.kind).toBe("reuse");
    expect(globalState.createdCount).toBe(2);
    expect(globalState.destroyedCount).toBe(1);

    harness.controller.dispose();
  });

  it("clears the established viewport when the locationId changes", async () => {
    const harness = makeHarness();
    const aEstablished = "loc-A|set|31.950000|35.880000|17";
    const bPending = "loc-B|pending|0.000000|0.000000|1";
    const aInstance = expectCreated(
      await harness.controller.ensure(aEstablished, {
        center: { latitude: 31.95, longitude: 35.88 },
        zoom: 17,
      }),
    );
    expect(aInstance.destroyed).toBe(false);

    const bDecision = await harness.controller.ensure(bPending, {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    const bInstance = expectCreated(bDecision);
    expect(aInstance.destroyed).toBe(true);
    expect(harness.controller.currentKey).toBe(bPending);

    const bEstablished = "loc-B|set|40.700000|-74.000000|17";
    const bEstablishedDecision = await harness.controller.ensure(bEstablished, {
      center: { latitude: 40.7, longitude: -74 },
      zoom: 17,
    });
    const bEstablishedInstance = expectCreated(bEstablishedDecision);
    expect(harness.controller.currentKey).toBe(bEstablished);
    expect(bEstablishedInstance).not.toBe(bInstance);

    harness.controller.dispose();
  });

  it("does not let B borrow A's established viewport when the key starts as pending", async () => {
    const harness = makeHarness();
    const aEstablished = "loc-A|set|31.950000|35.880000|17";
    const bPending = "loc-B|pending|0.000000|0.000000|1";
    const aInstance = expectCreated(
      await harness.controller.ensure(aEstablished, {
        center: { latitude: 31.95, longitude: 35.88 },
        zoom: 17,
      }),
    );

    const bDecision = await harness.controller.ensure(bPending, {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    const bInstance = expectCreated(bDecision);
    expect(bInstance).not.toBe(aInstance);
    const bCreate = harness.adapter.recordedCreates.at(-1);
    expect(bCreate?.options.center).toEqual({ latitude: 0, longitude: 0 });
    expect(bCreate?.options.zoom).toBe(1);
    expect(aInstance.destroyed).toBe(true);

    harness.controller.dispose();
  });
});

describe("MapController — dispose is idempotent and locks the controller", () => {
  it("destroy is called exactly once even on repeated dispose", async () => {
    const harness = makeHarness();
    const map = expectCreated(
      await harness.controller.ensure("loc-A|geom", {
        center: { latitude: 31.95, longitude: 35.88 },
        zoom: 17,
      }),
    );
    expect(map.destroyCount).toBe(0);

    harness.controller.dispose();
    expect(map.destroyCount).toBe(1);

    harness.controller.dispose();
    expect(map.destroyCount).toBe(1);
  });

  it("ensure after dispose returns noop-disposed without creating a new map", async () => {
    const harness = makeHarness();
    await harness.controller.ensure("loc-A|geom", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    harness.controller.dispose();
    expect(globalState.createdCount).toBe(1);

    const decision = await harness.controller.ensure("loc-A|geom", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    expect(decision.kind).toBe("noop-disposed");
    expect(globalState.createdCount).toBe(1);
  });
});

describe("MapController — late settlement after dispose", () => {
  it("destroys the late instance and does not adopt it", async () => {
    const adapter = new MockMapProviderAdapter();
    const original = adapter.createMap.bind(adapter);
    adapter.createMap = async (container, options) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      return original(container, options);
    };
    const controller = createMapController({
      adapter,
      getContainer: () => makeContainer(),
    });
    const inFlight = controller.ensure("loc-A|geom", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    controller.dispose();
    const decision = await inFlight;
    expect(decision.kind).toBe("noop-disposed");
    const late = globalState.lastCreate;
    expect(late?.destroyed).toBe(true);
  });
});
