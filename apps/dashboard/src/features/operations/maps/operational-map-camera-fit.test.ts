import { describe, expect, it } from "vitest";

import {
  recordOperationalMapCameraFit,
  shouldRefitOperationalMapCamera,
  type OperationalMapCameraFitState,
} from "./operational-map-camera-fit";

const world = { kind: "WORLD", center: { lat: 0, lng: 0 }, zoom: 2 } as const;
const single = {
  kind: "SINGLE",
  center: { lat: 31.95, lng: 35.91 },
  zoom: 17,
} as const;
const moved = {
  kind: "SINGLE",
  center: { lat: 31.951, lng: 35.911 },
  zoom: 17,
} as const;

describe("#270 operational map initial camera fit", () => {
  it("does not let an empty WORLD fallback consume the first usable coordinate fit", () => {
    let state: OperationalMapCameraFitState = {
      fallbackCameraKey: null,
      usableCameraKey: null,
    };
    expect(shouldRefitOperationalMapCamera(world, "A", state)).toBe(true);
    state = recordOperationalMapCameraFit(world, "A", state);
    expect(shouldRefitOperationalMapCamera(world, "A", state)).toBe(false);
    expect(shouldRefitOperationalMapCamera(single, "A", state)).toBe(true);
    state = recordOperationalMapCameraFit(single, "A", state);
    expect(shouldRefitOperationalMapCamera(moved, "A", state)).toBe(false);
    expect(shouldRefitOperationalMapCamera(world, "A", state)).toBe(false);
  });

  it("opens a fresh fit epoch when the semantic camera key changes", () => {
    const state = recordOperationalMapCameraFit(single, "A", {
      fallbackCameraKey: "A",
      usableCameraKey: null,
    });
    expect(shouldRefitOperationalMapCamera(moved, "A", state)).toBe(false);
    expect(shouldRefitOperationalMapCamera(world, "B", state)).toBe(true);
    expect(shouldRefitOperationalMapCamera(single, "B", state)).toBe(true);
  });
});
