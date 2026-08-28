/**
 * D6-004B — out-of-order async ensure race tests.
 *
 * A started, B started, A resolves AFTER B. The controller must
 * preserve B as the current owner and destroy A's late instance in
 * isolation. The same applies for the inverse order. This file
 * complements the synchronous lifecycle tests by exercising the
 * request-token mechanism with deterministic staged resolutions.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMapController } from "./map-lifecycle";
import {
  type MockMap,
  globalState,
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

beforeEach(() => {
  resetGlobalState();
});

afterEach(() => {
  globalState.lastCreate = null;
});

function asMock(value: unknown): MockMap {
  return value as MockMap;
}

describe("MapController — out-of-order async ensure", () => {
  it("A and B are in flight; B resolves first and becomes current; A's late resolution is destroyed", async () => {
    const adapter = new MockMapProviderAdapter();
    const originalCreate = adapter.createMap.bind(adapter);
    let aResolve: (v: Awaited<ReturnType<typeof originalCreate>>) => void =
      () => undefined;
    let bResolve: (v: Awaited<ReturnType<typeof originalCreate>>) => void =
      () => undefined;
    const aPromise = new Promise<Awaited<ReturnType<typeof originalCreate>>>(
      (resolve) => {
        aResolve = resolve;
      },
    );
    const bPromise = new Promise<Awaited<ReturnType<typeof originalCreate>>>(
      (resolve) => {
        bResolve = resolve;
      },
    );
    // First call → A's gate; second call → B's gate. Both are
    // externally controlled.
    let callIndex = 0;
    adapter.createMap = (container, options) => {
      const which = callIndex;
      callIndex += 1;
      adapter.recordedCreates.push({ container, options });
      return which === 0 ? aPromise : bPromise;
    };

    const controller = createMapController({
      adapter,
      getContainer: () => makeContainer(),
    });

    const aEnsure = controller.ensure("A", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    // Yield so A's createMap call is registered.
    await Promise.resolve();
    const bEnsure = controller.ensure("B", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    await Promise.resolve();

    // Resolve B first. A is still in flight, but B is the latest
    // requested owner so B's resolution is the one that adopts.
    bResolve(await originalCreate(makeContainer(), {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    }));
    const bResult = await bEnsure;
    expect(bResult.kind).toBe("create");
    expect(controller.currentKey).toBe("B");
    const bInstance = asMock(controller.currentInstance);
    expect(bInstance.destroyed).toBe(false);

    // Now resolve A. Its returned instance must be destroyed in
    // isolation; the controller must keep B as the current owner.
    aResolve(await originalCreate(makeContainer(), {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    }));
    const aResult = await aEnsure;
    expect(aResult.kind).toBe("noop-stale");
    expect(controller.currentKey).toBe("B");
    expect(controller.currentInstance).toBe(bInstance);
    // A's late instance is destroyed; B's instance is still alive.
    // The originalCreate that wrapped A's gate was called from the
    // test; it is the A-side instance.
    const aInstance = globalState.allCreated.find((entry) => entry.id === 2);
    expect(aInstance?.destroyed).toBe(true);
    expect(bInstance.destroyed).toBe(false);

    controller.dispose();
  });

  it("A resolves first and is adopted; B is then issued and adopts, A is destroyed", async () => {
    // A is created, adopted, and fully settled BEFORE B is ever
    // requested. This is the basic Location-switch equivalence under
    // the async path: B's createMap overwrites the controller's
    // current owner with a fresh instance and destroys A in isolation.
    const adapter = new MockMapProviderAdapter();
    const controller = createMapController({
      adapter,
      getContainer: () => makeContainer(),
    });
    const aResult = await controller.ensure("A", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    expect(aResult.kind).toBe("create");
    expect(controller.currentKey).toBe("A");
    const aInstance = asMock(controller.currentInstance);
    expect(aInstance.destroyed).toBe(false);

    const bResult = await controller.ensure("B", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    expect(bResult.kind).toBe("create");
    expect(controller.currentKey).toBe("B");
    const bInstance = asMock(controller.currentInstance);
    expect(bInstance).not.toBe(aInstance);
    expect(aInstance.destroyed).toBe(true);
    expect(bInstance.destroyed).toBe(false);

    controller.dispose();
  });

  it("three concurrent calls: only the latest adopted instance survives", async () => {
    const adapter = new MockMapProviderAdapter();
    const originalCreate = adapter.createMap.bind(adapter);
    const gates: Array<(v: Awaited<ReturnType<typeof originalCreate>>) => void> =
      [];
    adapter.createMap = (container, options) => {
      adapter.recordedCreates.push({ container, options });
      const gate = new Promise<Awaited<ReturnType<typeof originalCreate>>>(
        (resolve) => {
          gates.push(resolve);
        },
      );
      return gate;
    };
    const controller = createMapController({
      adapter,
      getContainer: () => makeContainer(),
    });
    const aPromise = controller.ensure("A", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    await Promise.resolve();
    const bPromise = controller.ensure("B", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    await Promise.resolve();
    const cPromise = controller.ensure("C", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    await Promise.resolve();

    // Resolve gates in the order the test wants: A first, then C,
    // then B. The id assignment follows the order `originalCreate`
    // is invoked, which is the order the gates were released.
    gates[0]?.(
      await originalCreate(makeContainer(), {
        center: { latitude: 0, longitude: 0 },
        zoom: 1,
      }),
    );
    gates[2]?.(
      await originalCreate(makeContainer(), {
        center: { latitude: 0, longitude: 0 },
        zoom: 1,
      }),
    );
    gates[1]?.(
      await originalCreate(makeContainer(), {
        center: { latitude: 0, longitude: 0 },
        zoom: 1,
      }),
    );

    const aResult = await aPromise;
    const bResult = await bPromise;
    const cResult = await cPromise;

    expect(aResult.kind).toBe("noop-stale");
    expect(bResult.kind).toBe("noop-stale");
    expect(cResult.kind).toBe("create");
    expect(controller.currentKey).toBe("C");

    // The id assignment order is A=1, C=2, B=3. Only C survives.
    const created = globalState.allCreated;
    expect(created).toHaveLength(3);
    expect(created[0]?.destroyed).toBe(true);
    expect(created[1]?.destroyed).toBe(false);
    expect(created[2]?.destroyed).toBe(true);

    controller.dispose();
  });

  it("dispose during in-flight ensure: late resolution is destroyed in isolation", async () => {
    const adapter = new MockMapProviderAdapter();
    const originalCreate = adapter.createMap.bind(adapter);
    const gates: Array<(v: Awaited<ReturnType<typeof originalCreate>>) => void> =
      [];
    adapter.createMap = (container, options) => {
      adapter.recordedCreates.push({ container, options });
      const gate = new Promise<Awaited<ReturnType<typeof originalCreate>>>(
        (resolve) => {
          gates.push(resolve);
        },
      );
      return gate;
    };
    const controller = createMapController({
      adapter,
      getContainer: () => makeContainer(),
    });
    const aPromise = controller.ensure("A", {
      center: { latitude: 0, longitude: 0 },
      zoom: 1,
    });
    await Promise.resolve();
    // Dispose before any gate is released.
    controller.dispose();
    gates[0]?.(
      await originalCreate(makeContainer(), {
        center: { latitude: 0, longitude: 0 },
        zoom: 1,
      }),
    );
    const aResult = await aPromise;
    expect(aResult.kind).toBe("noop-disposed");
    expect(controller.currentKey).toBeNull();
    expect(controller.currentInstance).toBeNull();
    // A's instance was destroyed in isolation.
    expect(globalState.allCreated[0]?.destroyed).toBe(true);
  });
});
