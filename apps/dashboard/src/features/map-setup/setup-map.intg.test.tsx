/**
 * D6-004B — SetupMap React component integration tests (part 1 of 2).
 * Initial mount + cheap update path.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("../../lib/maps/active-map-provider", () => ({
  createActiveMapProvider: () => new MockMapProviderAdapter(),
}));

import { LocaleProvider } from "../../i18n/locale-provider";
import { SetupMap } from "./setup-map";
import {
  globalState,
  MockMapProviderAdapter,
  resetGlobalState,
} from "./setup-map.test-double";
import {
  asMockMap,
  installMinimalBrowser,
} from "./setup-map.integration.test-double";
import type {
  MapClickHandler,
  MapMarkerDefinition,
  MapPolygonDefinition,
} from "../../lib/maps/map-provider";

let restore: () => void = () => undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetGlobalState();
  restore = installMinimalBrowser();
});

afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  document.body.innerHTML = "";
  restore();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

function makeMarker(
  id: string,
  latitude: number,
  longitude: number,
): MapMarkerDefinition {
  return { id, latitude, longitude };
}

function makePolygon(
  id: string,
  vertices: ReadonlyArray<{ latitude: number; longitude: number }>,
): MapPolygonDefinition {
  return { id, vertices };
}

interface MountHandle {
  root: Root;
  rerender: (next: {
    locationId?: string;
    markers?: readonly MapMarkerDefinition[];
    polygons?: readonly MapPolygonDefinition[];
    onMapClick?: MapClickHandler;
  }) => void;
  unmount: () => void;
}

function mountSetupMap(initial: {
  locationId: string;
  markers: readonly MapMarkerDefinition[];
  polygons: readonly MapPolygonDefinition[];
  onMapClick?: MapClickHandler;
}): MountHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const rerender: MountHandle["rerender"] = (next) => {
    act(() => {
      root.render(
        <LocaleProvider>
          <SetupMap
            ariaLabel="test setup map"
            locationId={next.locationId ?? initial.locationId}
            markers={next.markers ?? initial.markers}
            polygons={next.polygons ?? initial.polygons}
            onMapClick={next.onMapClick ?? initial.onMapClick}
          />
        </LocaleProvider>,
      );
    });
  };
  rerender({});
  return {
    root,
    rerender,
    unmount() {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(container);
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("SetupMap integration — initial mount with geometry", () => {
  it("pushes the initial markers onto the freshly created map", async () => {
    const markers = [makeMarker("p1", 31.95, 35.88)];
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers,
      polygons: [],
    });
    await flushMicrotasks();
    expect(globalState.allCreated).toHaveLength(1);
    const map = asMockMap(globalState.allCreated[0]);
    expect(map.setMarkersCalls).toHaveLength(1);
    expect(map.setMarkersCalls[0]?.map((entry) => entry.id)).toEqual(["p1"]);
    harness.unmount();
  });

  it("pushes the initial polygons onto the freshly created map", async () => {
    const polygons = [
      makePolygon("a1", [
        { latitude: 31.95, longitude: 35.88 },
        { latitude: 31.951, longitude: 35.88 },
        { latitude: 31.951, longitude: 35.881 },
      ]),
    ];
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers: [],
      polygons,
    });
    await flushMicrotasks();
    expect(globalState.allCreated).toHaveLength(1);
    const map = asMockMap(globalState.allCreated[0]);
    expect(map.setPolygonsCalls).toHaveLength(1);
    expect(map.setPolygonsCalls[0]?.map((entry) => entry.id)).toEqual(["a1"]);
    harness.unmount();
  });

  it("attaches the click handler on initial mount", async () => {
    let received: unknown = null;
    const onMapClick: MapClickHandler = (click) => {
      received = click;
    };
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers: [makeMarker("p1", 31.95, 35.88)],
      polygons: [],
      onMapClick,
    });
    await flushMicrotasks();
    const map = asMockMap(globalState.allCreated[0]);
    expect(map.setClickHandlerCalls).toHaveLength(1);
    expect(map.setClickHandlerCalls[0]).toBe(onMapClick);
    map.emitClick({
      coordinate: { latitude: 0, longitude: 0 },
      markerId: null,
      polygonId: null,
    });
    expect(received).not.toBeNull();
    harness.unmount();
  });
});

describe("SetupMap integration — cheap update path", () => {
  it("does NOT recreate the map on an equivalent parent re-render", async () => {
    const markers = [makeMarker("p1", 31.95, 35.88)];
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers,
      polygons: [],
    });
    await flushMicrotasks();
    const first = globalState.allCreated[0];
    expect(first).toBeDefined();

    harness.rerender({
      markers: [{ id: "p1", latitude: 31.95, longitude: 35.88 }],
    });
    await flushMicrotasks();
    expect(globalState.allCreated).toHaveLength(1);
    expect(globalState.allCreated[0]).toBe(first);

    harness.unmount();
  });

  it("pushes updated markers through the same instance", async () => {
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers: [
        makeMarker("p1", 31.95, 35.88),
        makeMarker("p2", 31.950001, 35.880001),
      ],
      polygons: [],
    });
    await flushMicrotasks();
    const map = asMockMap(globalState.allCreated[0]);

    harness.rerender({
      markers: [
        makeMarker("p1", 31.95, 35.88),
        makeMarker("p2", 31.950001, 35.880001),
        makeMarker("p3", 31.950002, 35.880002),
      ],
    });
    await flushMicrotasks();

    expect(globalState.allCreated).toHaveLength(1);
    expect(map.setMarkersCalls.length).toBeGreaterThanOrEqual(2);
    const last = map.setMarkersCalls.at(-1);
    expect(last?.map((entry) => entry.id)).toEqual(["p1", "p2", "p3"]);

    harness.unmount();
  });

  it("swaps the click handler on callback identity change without recreating the map", async () => {
    const first: MapClickHandler = () => undefined;
    const second: MapClickHandler = () => undefined;
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers: [makeMarker("p1", 31.95, 35.88)],
      polygons: [],
      onMapClick: first,
    });
    await flushMicrotasks();
    const map = asMockMap(globalState.allCreated[0]);
    expect(map.setClickHandlerCalls.at(-1)).toBe(first);

    harness.rerender({ onMapClick: second });
    await flushMicrotasks();

    expect(globalState.allCreated).toHaveLength(1);
    expect(map.setClickHandlerCalls.at(-1)).toBe(second);

    harness.unmount();
  });
});
