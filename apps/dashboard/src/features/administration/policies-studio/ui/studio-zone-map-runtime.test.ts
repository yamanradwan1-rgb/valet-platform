import { afterEach, describe, expect, it, vi } from "vitest";
import { attendanceZoneBoundPoints } from "../../settings/attendance-zone-bounds";
import {
  createStudioZoneMapRuntime,
  type StudioZoneMapSnapshot,
} from "./studio-zone-map-runtime";
import { testSdk, zone } from "./studio-zone-map-test-sdk";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const fake = testSdk();
  const onTilesLoaded = vi.fn();
  const runtime = createStudioZoneMapRuntime({
    ...fake,
    mapId: "test-map-id",
    theme: "dark",
    onTilesLoaded,
  });
  const onPick = vi.fn();
  const snapshot: StudioZoneMapSnapshot = {
    zones: [zone],
    draft: null,
    selectedId: zone.id,
    editable: true,
    locale: "en",
    onPick,
  };
  runtime.sync(snapshot);
  return { ...fake, runtime, snapshot, onPick, onTilesLoaded };
}

describe("Policies Studio geographic zone runtime", () => {
  it("constructs a real SDK map with existing map ID, theme and keyboard navigation", () => {
    const test = setup();
    expect(test.maps).toHaveLength(1);
    expect(test.maps[0]!.options).toMatchObject({
      mapId: "test-map-id",
      colorScheme: "DARK",
      keyboardShortcuts: true,
    });
    expect(test.onTilesLoaded).not.toHaveBeenCalled();
    test.maps[0]!.listeners.find((l) => l.name === "tilesloaded")!.callback({});
    expect(test.onTilesLoaded).toHaveBeenCalledOnce();
  });

  it("renders authoritative positions and decimal meter radii with active/disabled styles", () => {
    const test = setup();
    test.runtime.sync({
      ...test.snapshot,
      zones: [
        zone,
        {
          ...zone,
          id: "zone-b",
          latitude: -20,
          radius: 1000,
          status: "DISABLED",
        },
      ],
    });
    const attached = test.circles.filter((circle) => circle.map !== null);
    expect(attached.map((circle) => [circle.center, circle.radius])).toEqual([
      [{ lat: 12, lng: 24 }, 77.25],
      [{ lat: -20, lng: 24 }, 1000],
    ]);
    expect(attached[0]!.options.strokeColor).not.toBe(
      attached[1]!.options.strokeColor,
    );
    expect(test.markers.at(-1)!.options.title).toContain("Disabled");
    const expected = [zone, { ...zone, latitude: -20, radius: 1000 }].flatMap(
      (z) => attendanceZoneBoundPoints({ ...z, radiusMeters: z.radius }),
    );
    expect(test.maps[0]!.fits.at(-1)!.points).toEqual(expected);
  });

  it("keeps saved geometry when selecting and editing a distinct draft", () => {
    const test = setup();
    const saved = test.circles[0]!;
    test.runtime.sync({ ...test.snapshot, draft: { ...zone, latitude: 13 } });
    expect(saved.map).toBe(test.maps[0]);
    expect(test.circles.at(-1)!.center).toEqual({ lat: 13, lng: 24 });
    expect(test.circles.at(-1)!.options.strokeColor).not.toBe(
      saved.options.strokeColor,
    );
    expect(test.markers.at(-1)!.options.title).toBe("Unsaved draft");
    expect(test.onPick).not.toHaveBeenCalled();
  });

  it("updates draft coordinates and radius in place without reloading or replacing saved overlays", () => {
    const test = setup();
    const saved = test.circles[0]!;
    test.runtime.sync({ ...test.snapshot, draft: zone });
    const draft = test.circles.at(-1)!;
    test.runtime.sync({
      ...test.snapshot,
      draft: { ...zone, latitude: 15, longitude: -40, radius: 5.5 },
    });
    expect(test.maps).toHaveLength(1);
    expect(test.circles).toHaveLength(2);
    expect(draft.center).toEqual({ lat: 15, lng: -40 });
    expect(draft.radius).toBe(5.5);
    expect(saved.center).toEqual({ lat: 12, lng: 24 });
  });

  it("routes geographic map clicks only to the active authorized draft", () => {
    const test = setup();
    expect(test.maps[0]!.listeners.some((l) => l.name === "click")).toBe(false);
    test.runtime.sync({ ...test.snapshot, draft: zone });
    const click = test.maps[0]!.listeners.at(-1)!;
    const event = { latLng: { lat: () => 40, lng: () => -50 } };
    click.callback(event);
    expect(test.onPick).toHaveBeenCalledExactlyOnceWith(40, -50);
    test.runtime.sync({
      ...test.snapshot,
      draft: { ...zone, id: "replacement" },
    });
    click.callback(event);
    expect(test.onPick).toHaveBeenCalledTimes(1);
    expect(click.remove).toHaveBeenCalledOnce();
    const replaced = test.maps[0]!.listeners.at(-1)!;
    test.runtime.sync({ ...test.snapshot, draft: zone, editable: false });
    replaced.callback(event);
    expect(test.onPick).toHaveBeenCalledTimes(1);
  });

  it("removes cancelled/invalid drafts and never invents geometry for bad values", () => {
    const test = setup();
    test.runtime.sync({ ...test.snapshot, draft: zone });
    const draft = test.circles.at(-1)!;
    for (const invalid of [
      { latitude: NaN },
      { latitude: 91 },
      { longitude: 181 },
      { longitude: Infinity },
      { radius: 4.99 },
      { radius: 1000.01 },
      { radius: NaN },
    ]) {
      test.runtime.sync({ ...test.snapshot, draft: { ...zone, ...invalid } });
      expect(draft.map).toBeNull();
    }
    test.runtime.sync(test.snapshot);
    expect(test.circles).toHaveLength(2);
    expect(test.onPick).not.toHaveBeenCalled();
  });

  it("uses only a world viewport for an empty or invalid saved list", () => {
    const test = setup();
    test.runtime.sync({
      ...test.snapshot,
      zones: [{ ...zone, radius: NaN }],
      draft: null,
    });
    expect(test.circles.every((circle) => circle.map === null)).toBe(true);
    expect(test.maps[0]!.setCenter).toHaveBeenLastCalledWith({
      lat: 0,
      lng: 0,
    });
    expect(test.maps[0]!.setZoom).toHaveBeenLastCalledWith(2);
    expect(test.onPick).not.toHaveBeenCalled();
  });

  it("selects a saved zone without refitting or changing its authoritative geometry", () => {
    const test = setup();
    const fits = test.maps[0]!.fits.length;
    test.runtime.sync({ ...test.snapshot, selectedId: null });
    expect(test.maps[0]!.fits).toHaveLength(fits);
    expect(test.circles.at(-1)!.options.strokeWeight).toBe(2);
    expect(test.circles.at(-1)!.center).toEqual({
      lat: zone.latitude,
      lng: zone.longitude,
    });
  });

  it("cleans listeners, saved/draft overlays and ignores late callbacks after scope retirement", () => {
    const test = setup();
    test.runtime.sync({ ...test.snapshot, draft: zone });
    const click = test.maps[0]!.listeners.at(-1)!;
    test.runtime.destroy();
    test.runtime.destroy();
    test.runtime.sync(test.snapshot);
    click.callback({ latLng: { lat: () => 40, lng: () => 50 } });
    test.maps[0]!.listeners[0]!.callback({});
    expect(test.onPick).not.toHaveBeenCalled();
    expect(test.onTilesLoaded).not.toHaveBeenCalled();
    expect(test.circles.every((circle) => circle.map === null)).toBe(true);
    expect(test.markers.every((marker) => marker.map === null)).toBe(true);
    expect(
      test.maps[0]!.listeners.every((l) => l.remove.mock.calls.length === 1),
    ).toBe(true);
    expect(test.cleared).toHaveBeenCalledWith(test.maps[0]);
    expect(test.node.replaceChildren).toHaveBeenCalledOnce();
  });
});
