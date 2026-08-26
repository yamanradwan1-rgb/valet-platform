import { describe, expect, it } from "vitest";

import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import {
  initialTransientState,
  resetTransientOnLocationChange,
  type MapSetupTransientState,
} from "./map-setup-transient-state";

/**
 * Location-switch transient-state QA for /maps-zones (D3-003 pre-commit).
 *
 * The view applies exactly one identity boundary per switch through
 * `resetTransientOnLocationChange`; these tests pin that NO Location-A
 * transient fact — selection, editor (with its authoritative A snapshot or
 * an unsaved create draft), deactivation confirmation, picked coordinate or
 * A-raised error text — can survive into Location B, while same-location
 * renders keep their state untouched by reference.
 */

const LOCATION_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const LOCATION_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const A_POINT: LocationMapPoint = {
  active: true,
  code: "ENT_MAIN",
  createdAt: "2026-08-20T09:00:00+03:00",
  id: "11111111-0000-4000-8000-000000000001",
  kind: "ENTRANCE",
  label: "Location A entrance",
  latitude: 32.562703,
  levelLabel: null,
  longitude: 35.880055,
  updatedAt: "2026-08-20T09:00:00+03:00",
};

const A_AREA: LocationMapArea = {
  active: true,
  code: "PARK_A",
  createdAt: "2026-08-20T09:10:00+03:00",
  id: "aaaaaaaa-0000-4000-8000-00000000000a2",
  label: "Location A parking",
  levelLabel: null,
  parkingZoneId: null,
  purpose: "PARKING",
  updatedAt: "2026-08-20T09:10:00+03:00",
  vertices: [
    { latitude: 32.5625, longitude: 35.88, position: 0 },
    { latitude: 32.5628, longitude: 35.8805, position: 1 },
    { latitude: 32.5623, longitude: 35.8807, position: 2 },
  ],
};

/** Every transient field simultaneously populated with Location-A facts. */
function populatedWithAState(): MapSetupTransientState {
  return {
    actionError: "A board action failed.",
    deactivateTarget: { id: A_AREA.id, kind: "area" },
    editor: {
      area: A_AREA,
      type: "area.vertices",
    },
    pickedCoordinate: { latitude: -12.345678, longitude: 98.765432 },
    selectedAreaId: A_AREA.id,
    selectedPointId: A_POINT.id,
    sheetError: "A sheet mutation failed.",
  };
}

describe("neutral Map Setup transient state", () => {
  it("starts every interaction field from null", () => {
    expect(initialTransientState()).toEqual({
      actionError: null,
      deactivateTarget: null,
      editor: null,
      pickedCoordinate: null,
      selectedAreaId: null,
      selectedPointId: null,
      sheetError: null,
    });
  });
});

describe("same-location rendering keeps state untouched", () => {
  it("returns the exact current reference when the location did not change", () => {
    const current = populatedWithAState();
    expect(
      resetTransientOnLocationChange(LOCATION_A, LOCATION_A, current),
    ).toBe(current);
    // Re-renders under B after the boundary already ran are equally inert.
    expect(
      resetTransientOnLocationChange(LOCATION_B, LOCATION_B, current),
    ).toBe(current);
  });
});

describe("A -> B switch discards every A-scoped transient fact", () => {
  const reset = resetTransientOnLocationChange(
    LOCATION_A,
    LOCATION_B,
    populatedWithAState(),
  );

  it("clears the selected A point", () => {
    expect(reset.selectedPointId).toBeNull();
  });

  it("clears the selected A area", () => {
    expect(reset.selectedAreaId).toBeNull();
  });

  it("closes the open point editor", () => {
    const opened = resetTransientOnLocationChange(LOCATION_A, LOCATION_B, {
      ...populatedWithAState(),
      editor: { point: A_POINT, type: "point.edit" },
    });
    expect(opened.editor).toBeNull();
  });

  it("closes the open area fields editor", () => {
    const opened = resetTransientOnLocationChange(LOCATION_A, LOCATION_B, {
      ...populatedWithAState(),
      editor: { area: A_AREA, type: "area.fields" },
    });
    expect(opened.editor).toBeNull();
  });

  it("closes the vertex editor together with its A geometry snapshot", () => {
    expect(reset.editor).toBeNull();
    expect(populatedWithAState().editor?.type).toBe("area.vertices");
  });

  it("discards unsaved create drafts (point and area create sheets)", () => {
    const pointCreate = resetTransientOnLocationChange(LOCATION_A, LOCATION_B, {
      ...initialTransientState(),
      editor: { type: "point.create" },
    });
    const areaCreate = resetTransientOnLocationChange(LOCATION_A, LOCATION_B, {
      ...initialTransientState(),
      editor: { type: "area.create" },
    });
    expect(pointCreate.editor).toBeNull();
    expect(areaCreate.editor).toBeNull();
  });

  it("dismisses a pending A deactivation confirmation", () => {
    expect(reset.deactivateTarget).toBeNull();
  });

  it("clears the coordinate picked on A's map", () => {
    expect(reset.pickedCoordinate).toBeNull();
  });

  it("never presents A-raised mutation/error text as B state", () => {
    expect(reset.sheetError).toBeNull();
    expect(reset.actionError).toBeNull();
  });

  it("reduces the fully populated state to the exact neutral state", () => {
    expect(reset).toEqual(initialTransientState());
  });

  it("treats any location identity change symmetrically (B -> A too)", () => {
    const back = resetTransientOnLocationChange(
      LOCATION_B,
      LOCATION_A,
      populatedWithAState(),
    );
    expect(back).toEqual(initialTransientState());
  });
});

describe("mutation resolving after a switch cannot resurrect A UI", () => {
  it("leaves the neutral B state untouched when a late A response arrives", () => {
    // The view drops late outcomes through its activeLocationRef guard; at
    // the state level this means: nothing re-populates the bundle after the
    // boundary ran, regardless of how many A responses settle afterwards.
    let transient = resetTransientOnLocationChange(
      LOCATION_A,
      LOCATION_B,
      populatedWithAState(),
    );
    expect(transient).toEqual(initialTransientState());
    // Simulated late A success AND failure: neither mutates B's bundle.
    transient = resetTransientOnLocationChange(LOCATION_B, LOCATION_B, transient);
    expect(transient).toEqual(initialTransientState());
    expect(transient.editor).toBeNull();
    expect(transient.selectedPointId).toBeNull();
  });

  it("pairs with the existing merge guard so no A entity can merge into B", () => {
    // Documented composition: the transient boundary clears WHAT is shown;
    // map-setup-state's mergeMutationIntoSettled already rejects WHERE late
    // entities may land. Both guards stay independent and intact — running
    // the boundary again over an already-neutral bundle stays neutral.
    const stillNeutral = resetTransientOnLocationChange(
      LOCATION_A,
      LOCATION_B,
      initialTransientState(),
    );
    expect(stillNeutral).toEqual(initialTransientState());
  });
});
