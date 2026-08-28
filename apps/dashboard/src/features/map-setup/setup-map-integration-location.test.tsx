/**
 * D6-004B — SetupMap React component integration tests (part 2 of 2).
 * Location switch and unmount cleanup.
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

interface MountHandle {
  root: Root;
  rerender: (next: {
    locationId?: string;
    markers?: readonly MapMarkerDefinition[];
    onMapClick?: MapClickHandler;
  }) => void;
  unmount: () => void;
}

function mountSetupMap(initial: {
  locationId: string;
  markers: readonly MapMarkerDefinition[];
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
            polygons={[]}
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

describe("SetupMap integration — Location switch receives current data", () => {
  it("recreates the map on Location change and pushes the new geometry", async () => {
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers: [makeMarker("p1", 31.95, 35.88)],
    });
    await flushMicrotasks();
    const first = asMockMap(globalState.allCreated[0]);

    harness.rerender({
      locationId: "loc-B",
      markers: [makeMarker("p2", 40.7, -74)],
    });
    await flushMicrotasks();

    expect(globalState.allCreated).toHaveLength(2);
    expect(first.destroyed).toBe(true);
    const second = asMockMap(globalState.allCreated[1]);
    const lastSet = second.setMarkersCalls.at(-1);
    expect(lastSet?.map((entry) => entry.id)).toEqual(["p2"]);

    harness.unmount();
  });

  it("Location switch attaches the new click handler on the new map", async () => {
    const first: MapClickHandler = () => undefined;
    const second: MapClickHandler = () => undefined;
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers: [makeMarker("p1", 31.95, 35.88)],
      onMapClick: first,
    });
    await flushMicrotasks();
    const firstMap = asMockMap(globalState.allCreated[0]);

    harness.rerender({
      locationId: "loc-B",
      markers: [makeMarker("p2", 40.7, -74)],
      onMapClick: second,
    });
    await flushMicrotasks();
    const secondMap = asMockMap(globalState.allCreated[1]);
    expect(secondMap.setClickHandlerCalls.at(-1)).toBe(second);
    expect(secondMap.setClickHandlerCalls).toHaveLength(1);
    expect(firstMap.destroyed).toBe(true);

    harness.unmount();
  });
});

describe("SetupMap integration — unmount destroys exactly once", () => {
  it("destroy is called exactly once on unmount", async () => {
    const harness = mountSetupMap({
      locationId: "loc-A",
      markers: [makeMarker("p1", 31.95, 35.88)],
    });
    await flushMicrotasks();
    const map = asMockMap(globalState.allCreated[0]);
    expect(map.destroyCount).toBe(0);
    harness.unmount();
    expect(map.destroyCount).toBe(1);
  });
});
