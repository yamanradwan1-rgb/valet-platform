/**
 * D6-004B — LiveOperationsMap React component integration tests
 * (part 2 of 2). A → B → A reset, marker focus, and unmount.
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
import { LiveOperationsMap } from "./live-operations-map";
import {
  globalState,
  MockMapProviderAdapter,
  resetGlobalState,
} from "../map-setup/setup-map.test-double";
import {
  asMockMap,
  installMinimalBrowser,
} from "../map-setup/setup-map.integration.test-double";
import type { MapMarkerDescriptor } from "../../lib/maps/map-provider";

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

type MarkerDraft = Omit<MapMarkerDescriptor, "ariaLabel">;

function makeMarker(
  id: string,
  latitude: number,
  longitude: number,
): MarkerDraft {
  return { id, latitude, longitude, glyph: "P", selected: false, tone: "positive" };
}

interface MountHandle {
  root: Root;
  rerender: (next: {
    locationId?: string;
    markers?: readonly MarkerDraft[];
    selectedMarkerId?: string | null;
  }) => void;
  unmount: () => void;
}

function mountLiveOps(initial: {
  locationId: string;
  markers: readonly MarkerDraft[];
  selectedMarkerId?: string | null;
}): MountHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const describeMarker = (marker: MarkerDraft): string => `${marker.id}`;
  const rerender: MountHandle["rerender"] = (next) => {
    act(() => {
      root.render(
        <LocaleProvider>
          <LiveOperationsMap
            describeMarker={describeMarker}
            locationId={next.locationId ?? initial.locationId}
            markers={next.markers ?? initial.markers}
            onSelectMarker={() => undefined}
            selectedMarkerId={next.selectedMarkerId ?? initial.selectedMarkerId ?? null}
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

describe("LiveOperationsMap integration — A → B → A resets viewport establishment", () => {
  it("returns to the pending fallback when the original Location is re-entered", async () => {
    const harness = mountLiveOps({
      locationId: "loc-A",
      markers: [],
    });
    await flushMicrotasks();
    harness.rerender({
      markers: [makeMarker("a1", 40.7, -74)],
    });
    await flushMicrotasks();
    const aEstablished = asMockMap(globalState.allCreated[1]);

    harness.rerender({
      locationId: "loc-B",
      markers: [],
    });
    await flushMicrotasks();
    expect(aEstablished.destroyed).toBe(true);
    harness.rerender({
      locationId: "loc-B",
      markers: [makeMarker("b1", 31.95, 35.88)],
    });
    await flushMicrotasks();
    expect(globalState.allCreated.length).toBeGreaterThanOrEqual(3);

    // Switch back to A. A must be pending again. The OLD A
    // established viewport must NOT be reused.
    harness.rerender({
      locationId: "loc-A",
      markers: [],
    });
    await flushMicrotasks();
    const lastCreated = asMockMap(
      globalState.allCreated.at(-1) ?? globalState.allCreated[0],
    );
    expect(lastCreated.destroyed).toBe(false);
    harness.unmount();
  });

  it("re-establishes A from the FIRST fresh A snapshot after returning", async () => {
    const harness = mountLiveOps({
      locationId: "loc-A",
      markers: [],
    });
    await flushMicrotasks();
    harness.rerender({
      markers: [makeMarker("a1", 40.7, -74)],
    });
    await flushMicrotasks();
    const aEstablishedOriginal = asMockMap(globalState.allCreated[1]);

    harness.rerender({
      locationId: "loc-B",
      markers: [makeMarker("b1", 31.95, 35.88)],
    });
    await flushMicrotasks();
    expect(aEstablishedOriginal.destroyed).toBe(true);

    // Return to A with a new (different) marker. The viewport must
    // establish from this fresh snapshot, not from the original A.
    harness.rerender({
      locationId: "loc-A",
      markers: [],
    });
    await flushMicrotasks();
    harness.rerender({
      locationId: "loc-A",
      markers: [makeMarker("a2", 41.0, -75.0)],
    });
    await flushMicrotasks();
    const newest = asMockMap(
      globalState.allCreated.at(-1) ?? globalState.allCreated[0],
    );
    const last = newest.replacedMarkers.at(-1);
    expect(last?.map((entry) => entry.id)).toEqual(["a2"]);
    harness.unmount();
  });
});

describe("LiveOperationsMap integration — marker focus remains functional", () => {
  it("focuses the selected marker after the first snapshot establishes the map", async () => {
    const harness = mountLiveOps({
      locationId: "loc-A",
      markers: [],
    });
    await flushMicrotasks();
    harness.rerender({
      markers: [
        makeMarker("a1", 40.7, -74),
        makeMarker("a2", 40.71, -74.01),
      ],
    });
    await flushMicrotasks();

    harness.rerender({
      selectedMarkerId: "a2",
    });
    await flushMicrotasks();
    const established = asMockMap(globalState.allCreated[1]);
    expect(established.focused).toBe("a2");
    harness.unmount();
  });
});

describe("LiveOperationsMap integration — unmount destroys exactly once", () => {
  it("destroy is called exactly once on unmount", async () => {
    const harness = mountLiveOps({
      locationId: "loc-A",
      markers: [],
    });
    await flushMicrotasks();
    const map = asMockMap(globalState.allCreated[0]);
    expect(map.destroyCount).toBe(0);
    harness.unmount();
    expect(map.destroyCount).toBe(1);
  });
});
