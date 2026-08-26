import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { BrandingSetting } from "@valet/contracts";

import {
  initialBrandingTransientUi,
  reduceBrandingTransientUi,
} from "./branding-ui";

/**
 * Transient view-state pins for /branding (D4-004): the editor surface and
 * clear confirmation are wiped together by a single location-changed event,
 * and an A→B→A round trip starts clean (fresh A comes from a reload).
 */

const NAME: BrandingSetting = "brandDisplayName";
const COLOR: BrandingSetting = "brandPrimaryColor";

describe("branding transient UI reducer", () => {
  it("opens and dismisses each transient surface independently", () => {
    let state = initialBrandingTransientUi();
    state = reduceBrandingTransientUi(state, { setting: NAME, type: "editor-opened" });
    expect(state).toEqual({ clearConfirmFor: null, editorOpenFor: NAME });
    state = reduceBrandingTransientUi(state, {
      setting: COLOR,
      type: "clear-requested",
    });
    expect(state).toEqual({ clearConfirmFor: COLOR, editorOpenFor: NAME });
    state = reduceBrandingTransientUi(state, { type: "editor-dismissed" });
    expect(state).toEqual({ clearConfirmFor: COLOR, editorOpenFor: null });
    state = reduceBrandingTransientUi(state, { type: "clear-dismissed" });
    expect(state).toEqual(initialBrandingTransientUi());
  });

  it("one location-changed event clears ALL transient surfaces at once", () => {
    let state = initialBrandingTransientUi();
    state = reduceBrandingTransientUi(state, { setting: NAME, type: "editor-opened" });
    state = reduceBrandingTransientUi(state, {
      setting: NAME,
      type: "clear-requested",
    });
    expect(state).toEqual({ clearConfirmFor: NAME, editorOpenFor: NAME });
    state = reduceBrandingTransientUi(state, {
      locationId: "22222222-2222-4222-8222-222222222222",
      type: "location-changed",
    });
    expect(state).toEqual(initialBrandingTransientUi());
  });

  it("does not keep A state when switching A→B→A; fresh A comes from reload", () => {
    const locationA = "11111111-1111-4111-8111-111111111111";
    let state = initialBrandingTransientUi();
    state = reduceBrandingTransientUi(state, { setting: COLOR, type: "editor-opened" });
    // Switch to B: in production this is a keyed surface remount that
    // re-runs the reducer initializer (the event below is the belt-and-
    // braces identity reset for any non-remount path):
    state = reduceBrandingTransientUi(state, {
      locationId: "b",
      type: "location-changed",
    });
    // Back to A — nothing of the previous A session survives:
    state = reduceBrandingTransientUi(state, {
      locationId: locationA,
      type: "location-changed",
    });
    expect(state).toEqual(initialBrandingTransientUi());
  });
});

/**
 * Source invariant for the unsaved DRAFT (node env cannot mount React): the
 * draft lives ONLY as local useState inside BrandingEditorDialog, and that
 * dialog renders exclusively inside BrandingSurface — which is KEYED by the
 * selected location id, so an A→B switch unmounts the whole A surface (and
 * its draft) by construction. No scattered cleanup can be forgotten because
 * there is none outside this boundary.
 */
describe("draft ownership boundary", () => {
  const viewSource = readFileSync(
    new URL("./branding-view.tsx", import.meta.url),
    "utf8",
  );
  const dialogSource = readFileSync(
    new URL("./branding-editor-dialog.tsx", import.meta.url),
    "utf8",
  );

  it("the unsaved draft is component-local to the unmounting dialog", () => {
    expect(dialogSource).toContain("useState<string>(initial)");
    expect(dialogSource).not.toMatch(/useContext|useDashboardLocation/u);
  });

  it("the dialog mounts only inside the location-keyed surface", () => {
    expect(viewSource).toContain("<BrandingEditorDialog");
    expect(viewSource.indexOf("<BrandingEditorDialog")).toBeGreaterThan(
      viewSource.indexOf("<BrandingSurface"),
    );
    expect(viewSource).toMatch(/<BrandingSurface[\s\S]*?key=\{locationKey\}/u);
  });
});
