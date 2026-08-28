/**
 * D6-004A — MapController lifecycle QA (part 1 of 3).
 *
 * First-render, stable-reuse, and viewport-change scenarios for the
 * controller that backs both SetupMap and LiveOperationsMap.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMapController,
  previewEnsure,
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

function expectReused(decision: unknown): MockMap {
  if (
    !decision ||
    typeof decision !== "object" ||
    (decision as { kind?: string }).kind !== "reuse"
  ) {
    throw new Error(`expected reuse decision, got ${String(decision)}`);
  }
  return (decision as { instance: MockMap }).instance;
}

interface Harness {
  controller: MapController;
  adapter: MockMapProviderAdapter;
  setContainer: (container: HTMLElement | null) => void;
}

function makeHarness(): Harness {
  const adapter = new MockMapProviderAdapter();
  const container: { current: HTMLElement | null } = { current: makeContainer() };
  const controller = createMapController({
    adapter,
    getContainer: () => container.current,
  });
  return {
    adapter,
    controller,
    setContainer: (next) => {
      container.current = next;
    },
  };
}

beforeEach(() => {
  resetGlobalState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MapController — first render", () => {
  it("creates exactly one map for the initial key", async () => {
    const harness = makeHarness();
    const decision = await harness.controller.ensure("key-1", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    expect(decision.kind).toBe("create");
    expect(globalState.createdCount).toBe(1);
    expect(globalState.destroyedCount).toBe(0);
    expect(harness.controller.currentKey).toBe("key-1");
    harness.controller.dispose();
    expect(globalState.destroyedCount).toBe(1);
  });

  it("uses the options provided by the caller", async () => {
    const harness = makeHarness();
    await harness.controller.ensure("key-1", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    expect(harness.adapter.recordedCreates).toHaveLength(1);
    expect(harness.adapter.recordedCreates[0]?.options.center).toEqual({
      latitude: 31.95,
      longitude: 35.88,
    });
    expect(harness.adapter.recordedCreates[0]?.options.zoom).toBe(17);
    harness.controller.dispose();
  });

  it("returns noop-stale when the container is not yet attached (component will retry on the next render)", async () => {
    const harness = makeHarness();
    harness.setContainer(null);
    const decision = await harness.controller.ensure("key-1", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    // The container is missing so no adapter call was made; the
    // component is expected to retry on the next render. From the
    // controller's point of view this is a "no instance produced"
    // outcome, not a disposal.
    expect(decision.kind).toBe("noop-stale");
    expect(globalState.createdCount).toBe(0);
    harness.controller.dispose();
  });
});

describe("MapController — stable on equivalent viewport key", () => {
  it("does NOT recreate the map when the same key is observed again", async () => {
    const harness = makeHarness();
    const first = await harness.controller.ensure("loc-A|geom", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    const firstInstance = expectCreated(first);

    const second = await harness.controller.ensure("loc-A|geom", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    const secondInstance = expectReused(second);
    expect(secondInstance).toBe(firstInstance);

    expect(globalState.createdCount).toBe(1);
    expect(globalState.destroyedCount).toBe(0);
    harness.controller.dispose();
  });

  it("does NOT recreate the map for repeated equivalent keys", async () => {
    const harness = makeHarness();
    for (let index = 0; index < 5; index += 1) {
      await harness.controller.ensure("loc-A|geom", {
        center: { latitude: 31.95, longitude: 35.88 },
        zoom: 17,
      });
    }
    expect(globalState.createdCount).toBe(1);
    expect(globalState.destroyedCount).toBe(0);
    harness.controller.dispose();
  });

  it("previewEnsure reports reuse for matching keys and create for changes", async () => {
    const harness = makeHarness();
    await harness.controller.ensure("loc-A|geom", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    expect(previewEnsure(harness.controller, "loc-A|geom")).toBe("reuse");
    expect(previewEnsure(harness.controller, "loc-A|geom-2")).toBe("create");
    expect(previewEnsure(harness.controller, "loc-B|geom")).toBe("create");
    harness.controller.dispose();
  });
});

describe("MapController — viewport change recreates the map", () => {
  it("destroys the old and creates a new when the key changes", async () => {
    const harness = makeHarness();
    const first = await harness.controller.ensure("loc-A|31.95|35.88|17", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    const firstInstance = expectCreated(first);

    const second = await harness.controller.ensure("loc-A|40.7|-74|17", {
      center: { latitude: 40.7, longitude: -74 },
      zoom: 17,
    });
    const secondInstance = expectCreated(second);
    expect(secondInstance).not.toBe(firstInstance);
    expect(firstInstance.destroyed).toBe(true);
    expect(globalState.createdCount).toBe(2);
    expect(globalState.destroyedCount).toBe(1);

    harness.controller.dispose();
  });
});
