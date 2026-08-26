import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { BrandingReadResponse } from "@valet/contracts";

import { LocaleProvider } from "../../i18n/locale-provider";
import { BrandingPreviewCard } from "./branding-preview-card";

/**
 * Preview-isolation pins (D4-004 pre-commit review §11):
 * - the preview renders ONLY the backend-provided EFFECTIVE values of the
 *   current location envelope — never the company default when it differs,
 *   and never any editor draft (drafts live in the dialog component alone);
 * - no branding production source touches document/global storage/theme in
 *   any way (source invariant; node test environment cannot execute effects).
 */

const noop = (): void => undefined;
void noop;

const ENVELOPE: BrandingReadResponse = {
  displayName: {
    // Client precedence math or default-fallback rendering would show
    // "Company Name"; the backend says the applied name differs:
    default: "Company Name",
    effective: "Applied Name",
    override: null,
    overridePresent: false,
  },
  locationId: "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60",
  primaryColor: {
    default: "#176BFF",
    effective: "#00AABB",
    override: null,
    overridePresent: false,
  },
  updatedAt: "2026-08-22T00:00:00.000Z",
};

function renderPreview(data: BrandingReadResponse): string {
  return renderToStaticMarkup(
    <LocaleProvider>
      <BrandingPreviewCard data={data} />
    </LocaleProvider>,
  );
}

describe("preview renders only backend-effective values", () => {
  it("shows the applied name/color and never the differing company defaults", () => {
    const markup = renderPreview(ENVELOPE);
    expect(markup.includes("Applied Name")).toBe(true);
    expect(markup.includes("#00AABB")).toBe(true);
    // Defaults that differ from applied must NOT leak into the preview:
    expect(markup.includes("Company Name")).toBe(false);
    expect(markup.includes("#176BFF")).toBe(false);
  });

  it("keeps hex text visible next to decorative-only swatches", () => {
    const markup = renderPreview(ENVELOPE);
    expect((markup.match(/aria-hidden="true"/gu) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(markup.includes('dir="ltr"')).toBe(true);
  });
});

describe("no global theme/storage access anywhere in branding production code", () => {
  // Comments are stripped first: several files document the absence of these
  // APIs in prose, and prose must never trip a code-level invariant.
  const stripComments = (source: string): string =>
    source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/^\s*\/\/.*$/gmu, "");

  const productionSources = [
    "branding-api.ts",
    "branding-controller.ts",
    "branding-editor-dialog.tsx",
    "branding-labels.ts",
    "branding-preview-card.tsx",
    "branding-row.tsx",
    "branding-state.ts",
    "branding-ui.ts",
    "branding-view.tsx",
    "clear-branding-dialog.tsx",
    "use-branding.ts",
  ].map((name) =>
    stripComments(
      readFileSync(new URL(`./${name}`, import.meta.url), "utf8"),
    ),
  );

  it("never mutates document/global CSS variables/theme", () => {
    for (const source of productionSources) {
      expect(source).not.toMatch(/documentElement/u);
      expect(source).not.toMatch(/style\.setProperty/u);
      expect(source).not.toMatch(/classList/u);
      expect(source).not.toMatch(/dataset\./u);
      expect(source).not.toMatch(/document\.cookie/u);
      expect(source).not.toMatch(/getPropertyValue/u);
    }
  });

  it("never persists anything to web storage", () => {
    for (const source of productionSources) {
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
    }
  });

  it("the preview reads exactly the authoritative effective projections", () => {
    const previewSource = productionSources[4]!;
    expect(previewSource).toContain("data.displayName.effective");
    expect(previewSource).toContain("data.primaryColor.effective");
    expect(previewSource).not.toContain(".override");
    expect(previewSource).not.toContain(".default");
  });
});
