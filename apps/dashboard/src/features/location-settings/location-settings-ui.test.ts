import { describe, expect, it } from "vitest";

import {
  initialTransientUi,
  reduceTransientUi,
} from "./location-settings-ui";

/**
 * Location-identity reset boundary pins for the /location-settings
 * VIEW-local transient state (D4-003): an open override editor (including
 * its unsaved draft, which lives inside the unmounting sheet), a pending
 * clear confirmation — and both together — must all be discarded by the
 * single `location-changed` event so nothing of Location A can remain
 * visible under Location B.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SETTING = "valetServiceFee" as const;

describe("transient settings ui state", () => {
  it("closes an open A editor when the location changes to B", () => {
    const opened = reduceTransientUi(initialTransientUi(), {
      setting: SETTING,
      type: "editor-opened",
    });
    expect(opened.editorOpenFor).toBe(SETTING);
    const switched = reduceTransientUi(opened, {
      locationId: B,
      type: "location-changed",
    });
    expect(switched.editorOpenFor).toBeNull();
  });

  it("discards an A unsaved draft implicitly by closing/remounting the sheet", () => {
    // The draft is component-local to OverrideEditorSheet; the reducer's
    // contract is that the sheet is not rendered after a location change,
    // which unmounts it. This test pins the visibility side of that deal:
    const opened = reduceTransientUi(initialTransientUi(), {
      setting: SETTING,
      type: "editor-opened",
    });
    const switched = reduceTransientUi(opened, {
      locationId: B,
      type: "location-changed",
    });
    // No editor may be visible under B without a fresh B-side action:
    expect(switched).toEqual({ clearConfirmFor: null, editorOpenFor: null });
  });

  it("closes an A clear-confirmation dialog immediately on switch", () => {
    const requested = reduceTransientUi(initialTransientUi(), {
      setting: SETTING,
      type: "clear-requested",
    });
    expect(requested.clearConfirmFor).toBe(SETTING);
    const switched = reduceTransientUi(requested, {
      locationId: B,
      type: "location-changed",
    });
    expect(switched.clearConfirmFor).toBeNull();
  });

  it("clears BOTH surfaces at once through the single boundary", () => {
    const both = reduceTransientUi(
      reduceTransientUi(initialTransientUi(), {
        setting: SETTING,
        type: "editor-opened",
      }),
      { setting: SETTING, type: "clear-requested" },
    );
    expect(both.editorOpenFor).toBe(SETTING);
    expect(both.clearConfirmFor).toBe(SETTING);
    const switched = reduceTransientUi(both, {
      locationId: B,
      type: "location-changed",
    });
    expect(switched).toEqual(initialTransientUi());
  });

  it("supports normal open/dismiss flows without touching the other surface", () => {
    let state = initialTransientUi();
    state = reduceTransientUi(state, { setting: SETTING, type: "editor-opened" });
    state = reduceTransientUi(state, { type: "editor-dismissed" });
    expect(state).toEqual({ clearConfirmFor: null, editorOpenFor: null });
    state = reduceTransientUi(state, { setting: SETTING, type: "clear-requested" });
    state = reduceTransientUi(state, { type: "clear-dismissed" });
    expect(state).toEqual(initialTransientUi());
  });

  it("does not keep A state when switching A→B→A; fresh A comes from reload", () => {
    let state = initialTransientUi();
    state = reduceTransientUi(state, { setting: SETTING, type: "editor-opened" });
    state = reduceTransientUi(state, { locationId: B, type: "location-changed" });
    state = reduceTransientUi(state, { locationId: A, type: "location-changed" });
    // No invented persistence of A's attempted draft: returning to A starts
    // clean and renders from the authoritative A reload.
    expect(state.editorOpenFor).toBeNull();
  });
});
