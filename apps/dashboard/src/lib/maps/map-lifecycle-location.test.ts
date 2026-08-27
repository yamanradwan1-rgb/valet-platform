/**
 * D6-004A — MapController lifecycle QA (part 2 of 3).
 *
 * Location-switching and data-push scenarios, including the
 * two-different-locations with numerically identical viewport case.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMapController,
  type MapController,
  type MapDataInput,
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

beforeEach(() => {
  resetGlobalState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MapController — Location switch", () => {
  it("destroys the old and creates a new when the locationId portion of the key changes", async () => {
    const harness = makeHarness();
    const first = await harness.controller.ensure("loc-A|31.95|35.88|17", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    const firstInstance = expectCreated(first);

    const second = await harness.controller.ensure("loc-B|40.7|-74|17", {
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

  it("resets the lifecycle even when two locations share the same numeric viewport suffix", async () => {
    const harness = makeHarness();
    const shared = "31.95|35.88|17";
    const first = await harness.controller.ensure(`loc-A|${shared}`, {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    const firstInstance = expectCreated(first);

    const second = await harness.controller.ensure(`loc-B|${shared}`, {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    const secondInstance = expectCreated(second);
    expect(secondInstance).not.toBe(firstInstance);
    expect(firstInstance.destroyed).toBe(true);

    harness.controller.dispose();
  });
});

describe("MapController — data pushes do not destroy the instance", () => {
  it("replaces markers through the same instance", async () => {
    const harness = makeHarness();
    const decision = await harness.controller.ensure("loc-A|geom", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    const map = expectCreated(decision);

    const first: MapDataInput = {
      markers: [{ id: "p1", latitude: 31.95, longitude: 35.88 }],
    };
    const second: MapDataInput = {
      markers: [
        { id: "p1", latitude: 31.95, longitude: 35.88 },
        { id: "p2", latitude: 31.951, longitude: 35.881 },
      ],
    };
    harness.controller.pushData(first);
    harness.controller.pushData(second);

    expect(globalState.createdCount).toBe(1);
    expect(map.setMarkersCalls).toHaveLength(2);
    const last = map.setMarkersCalls.at(-1);
    expect(last?.map((entry) => entry.id)).toEqual(["p1", "p2"]);

    harness.controller.dispose();
  });

  it("replaces polygons through the same instance", async () => {
    const harness = makeHarness();
    const decision = await harness.controller.ensure("loc-A|geom", {
      center: { latitude: 31.95, longitude: 35.88 },
      zoom: 17,
    });
    const map = expectCreated(decision);

    const first: MapDataInput = {
      polygons: [
        {
          id: "a1",
          vertices: [
            { latitude: 31.95, longitude: 35.88 },
            { latitude: 31.951, longitude: 35.88 },
            { latitude: 31.951, longitude: 35.881 },
          ],
        },
      ],
    };
    const second: MapDataInput = {
      polygons: [
        {
          id: "a1",
          vertices: [
            { latitude: 31.95, longitude: 35.88 },
            { latitude: 31.951, longitude: 35.88 },
            { latitude: 31.951, longitude: 35.881 },
          ],
        },
        {
          id: "a2",
          vertices: [
            { latitude: 31.96, longitude: 35.88 },
            { latitude: 31.961, longitude: 35.88 },
            { latitude: 31.961, longitude: 35.881 },
          ],
        },
      ],
    };
    harness.controller.pushData(first);
    harness.controller.pushData(second);

    expect(globalState.createdCount).toBe(1);
    expect(map.setPolygonsCalls).toHaveLength(2);
    const last = map.setPolygonsCalls.at(-1);
    expect(last?.map((entry) => entry.id)).toEqual(["a1", "a2"]);

    harness.controller.dispose();
  });
});
