import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Remount-key contract for map-setup editor sheets (D5-001).
 *
 * WHY a source invariant: sheets hold their form drafts in mount state, and
 * the dashboard test environment is `node` (no jsdom) — reconciliation of
 * the same component type across an editor-target change cannot be executed
 * here. The defect this pins: keyboard focus can move between board rows
 * behind the modal backdrop, so `editor` may change from entity A to entity
 * B with NO intervening close; without a `key`, React preserves the mount
 * and A's draft survives, so saving would PATCH A's values onto B
 * (wrong-target mutation). The same hazard applies to the Branding editor
 * dialog, which switches settings without an unmount.
 *
 * The accepted in-repo pattern is `<OverrideEditorSheet key={…setting}>`
 * (features/location-settings/location-settings-view.tsx); these assertions
 * pin the equivalent keys on every sheet element.
 */

const SHEETS_SOURCE = readFileSync(
  new URL("./editor-sheets.tsx", import.meta.url),
  "utf8",
);

const BRANDING_SOURCE = readFileSync(
  new URL("../branding/branding-view.tsx", import.meta.url),
  "utf8",
);

describe("map-setup sheet remount keys", () => {
  it("keys every editor sheet by kind and entity identity", () => {
    expect(SHEETS_SOURCE.includes('key="point:create"')).toBe(true);
    expect(SHEETS_SOURCE.includes("key={`point:${editor.point.id}`}")).toBe(
      true,
    );
    expect(SHEETS_SOURCE.includes('key="area:create"')).toBe(true);
    expect(
      SHEETS_SOURCE.includes("key={`area-fields:${editor.area.id}`}"),
    ).toBe(true);
    expect(
      SHEETS_SOURCE.includes("key={`area-vertices:${editor.area.id}`}"),
    ).toBe(true);
  });

  it("documents the wrong-target mutation hazard at the component contract", () => {
    expect(SHEETS_SOURCE.includes("REMOUNT KEYS ARE MANDATORY")).toBe(true);
    expect(SHEETS_SOURCE.includes("PATCH entity A's values onto B")).toBe(
      true,
    );
  });
});

describe("branding editor dialog remount key", () => {
  it("remounts the branding editor per setting", () => {
    expect(BRANDING_SOURCE.includes("key={ui.editorOpenFor}")).toBe(true);
  });
});
