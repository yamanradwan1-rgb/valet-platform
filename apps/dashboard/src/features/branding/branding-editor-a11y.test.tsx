import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { BrandingProjection } from "./branding-state";

import { LocaleProvider } from "../../i18n/locale-provider";
import { BrandingEditorDialog } from "./branding-editor-dialog";
import { ClearBrandingDialog } from "./clear-branding-dialog";

/**
 * Focused accessibility guards for the two Branding dialogs (D4-004),
 * mirroring the reviewed Location Settings dialog a11y suite.
 *
 * 1. LABEL ASSOCIATIONS: both editor modes render exactly one real
 *    <label htmlFor="branding-editor-input"> bound to the primary input.
 *    The color swatch is decorative only (aria-hidden) — the hex string is
 *    always present as text, so the value never rides on color alone.
 * 2. INITIAL FOCUS: both dialogs move keyboard focus inside themselves on
 *    mount using the accepted ref + empty-deps useEffect pattern. The
 *    dashboard test environment is `node` (no jsdom), so live
 *    document.activeElement assertions are not available here; the pattern
 *    is pinned by source invariants below, while everything renderable is
 *    proven through react-dom/server static rendering.
 */

const noop = (): void => undefined;

const NAME_PROJECTION: BrandingProjection = {
  default: "Downtown Valet",
  effective: "Nova Valet",
  override: null,
  overridePresent: false,
};

const COLOR_PROJECTION: BrandingProjection = {
  default: "#176BFF",
  effective: "#176BFF",
  override: "#00AABB",
  overridePresent: true,
};

function renderEditor(
  setting: "brandDisplayName" | "brandPrimaryColor",
  projection: BrandingProjection,
): string {
  return renderToStaticMarkup(
    <LocaleProvider>
      <BrandingEditorDialog
        onClose={noop}
        onSave={noop}
        pending={false}
        projection={projection}
        setting={setting}
      />
    </LocaleProvider>,
  );
}

describe("branding editor dialog labeling", () => {
  it("keeps exactly one real label/control association in name mode", () => {
    const markup = renderEditor("brandDisplayName", NAME_PROJECTION);
    expect((markup.match(/<label/u) ?? []).length).toBe(1);
    expect(markup.includes('for="branding-editor-input"')).toBe(true);
    expect(markup.includes('id="branding-editor-input"')).toBe(true);
    expect(markup.includes('type="text"')).toBe(true);
  });

  it("keeps one label plus an aria-labeled picker and text-carried hex in color mode", () => {
    const markup = renderEditor("brandPrimaryColor", COLOR_PROJECTION);
    // Exactly ONE <label> element, still bound to the primary text field:
    expect((markup.match(/<label/u) ?? []).length).toBe(1);
    expect(markup.includes('for="branding-editor-input"')).toBe(true);
    // The native picker carries its own accessible name:
    expect(markup.includes('type="color"')).toBe(true);
    expect(markup.includes('aria-label="Pick a color"')).toBe(true);
    // The exact hex values are visible TEXT; swatches are aria-hidden:
    expect(markup.includes("#00AABB")).toBe(true);
    expect(markup.includes("#176BFF")).toBe(true);
    expect((markup.match(/aria-hidden="true"/gu) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("renders dialog semantics with aria-modal", () => {
    const markup = renderEditor("brandDisplayName", NAME_PROJECTION);
    expect(markup.includes('role="dialog"')).toBe(true);
    expect(markup.includes("aria-modal")).toBe(true);
  });
});

describe("clear branding dialog static rendering", () => {
  it("renders an accessible alertdialog with Cancel ahead of confirm", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider>
        <ClearBrandingDialog
          busy={false}
          onCancel={noop}
          onConfirm={noop}
          settingLabel="Primary color"
        />
      </LocaleProvider>,
    );
    expect(markup.includes('role="alertdialog"')).toBe(true);
    expect(markup.includes("aria-modal")).toBe(true);
    expect(markup.includes("Primary color")).toBe(true);
    const cancelIndex = markup.indexOf('class="btn-secondary"');
    const confirmIndex = markup.indexOf('class="btn-primary"');
    expect(cancelIndex).toBeGreaterThan(-1);
    expect(confirmIndex).toBeGreaterThan(cancelIndex);
  });
});

/**
 * Source invariants pinning the accepted mount-focus baseline (the node test
 * environment cannot execute DOM effects).
 */
describe("dialog initial focus pattern", () => {
  const editorSource = readFileSync(
    new URL("./branding-editor-dialog.tsx", import.meta.url),
    "utf8",
  );
  const clearSource = readFileSync(
    new URL("./clear-branding-dialog.tsx", import.meta.url),
    "utf8",
  );

  it("editor focuses its first field, falling back to Cancel", () => {
    expect(
      /querySelector<HTMLElement>\(\s*"input, select",?\s*\)/u.test(
        editorSource,
      ),
    ).toBe(true);
    expect(
      /\(\s*field \?\? cancelButtonRef\.current\s*\)\?\.focus\(\)/u.test(
        editorSource,
      ),
    ).toBe(true);
    expect(editorSource).toContain('"Escape"');
    expect(editorSource).toContain('role="alert"');
  });

  it("clear dialog focuses the non-destructive Cancel action", () => {
    expect(clearSource).toContain("cancelButtonRef.current?.focus()");
    expect(clearSource).toContain('ref={cancelButtonRef}');
    expect(clearSource).toContain('"Escape"');
  });
});
