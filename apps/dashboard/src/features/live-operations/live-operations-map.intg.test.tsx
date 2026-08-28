/**
 * D6-004B — LiveOperationsMap React component integration tests
 * (part 1 of 2). Initial mount, first non-empty snapshot, and
 * subsequent updates.
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

describe("LiveOperationsMap integration — initial mount with empty markers", () => {
  it("creates a map at the world fallback when no markers are present", async () => {
    const harness = mountLiveOps({
      locationId: "loc-A",
      markers: [],
    });
    await flushMicrotasks();
    expect(globalState.allCreated).toHaveLength(1);
    const map = asMockMap(globalState.allCreated[0]);
    expect(map.destroyed).toBe(false);
    harness.unmount();
  });
});

describe("LiveOperationsMap integration — first non-empty snapshot establishes the viewport", () => {
  it("creates a second map when the first non-empty marker snapshot arrives", async () => {
    const harness = mountLiveOps({
      locationId: "loc-A",
      markers: [],
    });
    await flushMicrotasks();
    expect(globalState.allCreated).toHaveLength(1);
    const first = asMockMap(globalState.allCreated[0]);
    expect(first.destroyed).toBe(false);

    harness.rerender({
      markers: [makeMarker("a1", 40.7, -74)],
    });
    await flushMicrotasks();
    expect(globalState.allCreated).toHaveLength(2);
    expect(first.destroyed).toBe(true);
    const second = asMockMap(globalState.allCreated[1]);
    expect(second.destroyed).toBe(false);
    harness.unmount();
  });

  it("pushes the markers onto the freshly established map", async () => {
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

    const established = asMockMap(globalState.allCreated[1]);
    expect(established.replacedMarkers.length).toBeGreaterThanOrEqual(1);
    const last = established.replacedMarkers.at(-1);
    expect(last?.map((entry) => entry.id)).toEqual(["a1", "a2"]);
    harness.unmount();
  });
});

describe("LiveOperationsMap integration — subsequent marker updates do not recreate", () => {
  it("does NOT recreate the map when a follow-up marker snapshot arrives", async () => {
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
    expect(globalState.allCreated).toHaveLength(2);
    const established = asMockMap(globalState.allCreated[1]);
    const initialReplaced = established.replacedMarkers.length;

    harness.rerender({
      markers: [
        makeMarker("a1", 40.7, -74),
        makeMarker("a2", 40.71, -74.01),
        makeMarker("a3", 40.7001, -74.0001),
      ],
    });
    await flushMicrotasks();

    expect(globalState.allCreated).toHaveLength(2);
    expect(established.replacedMarkers.length).toBeGreaterThan(initialReplaced);
    const last = established.replacedMarkers.at(-1);
    expect(last?.map((entry) => entry.id)).toEqual(["a1", "a2", "a3"]);
    harness.unmount();
  });
});
