import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { BrandingProjection } from "./branding-state";

import { LocaleProvider } from "../../i18n/locale-provider";
import { BrandingRow } from "./branding-row";

/**
 * Render-level effective-ownership pin (D4-004 pre-commit review §5): with a
 * DELIBERATELY INCONSISTENT fixture where client-side precedence math
 * (`override ?? default`) would produce a DIFFERENT string than the
 * backend-provided `effective`, the row must display the backend value
 * verbatim in the Applied column and never its own recomputation.
 */

const noop = (): void => undefined;

function render(
  setting: "brandDisplayName" | "brandPrimaryColor",
  projection: BrandingProjection,
): string {
  return renderToStaticMarkup(
    <LocaleProvider>
      <BrandingRow
        disabled={false}
        onClear={noop}
        onSetOrEdit={noop}
        projection={projection}
        setting={setting}
      />
    </LocaleProvider>,
  );
}

describe("branding row renders backend truth verbatim", () => {
  it("color row: backend effective wins over any client precedence math", () => {
    const markup = render("brandPrimaryColor", {
      // Client math `override ?? default` would yield "#176BFF" here;
      // the backend says the applied color is "#00AABB":
      default: "#176BFF",
      effective: "#00AABB",
      override: null,
      overridePresent: false,
    });
    expect(markup.includes("#00AABB")).toBe(true);
    expect(markup.includes('class="branding-applied"')).toBe(true);
    expect(markup.includes("#176BFF")).toBe(true); // default column only
    expect(markup.includes("Using company default")).toBe(true);
    expect(markup.includes("Use company default…")).toBe(false);
  });

  it("name row: inconsistent override/effective renders BOTH backend strings", () => {
    const markup = render("brandDisplayName", {
      default: "Downtown Valet",
      effective: "Applied Name",
      override: "Override Name",
      overridePresent: true,
    });
    // All three backend facts appear exactly as provided:
    expect(markup.includes("Downtown Valet")).toBe(true);
    expect(markup.includes("Override Name")).toBe(true);
    expect(markup.includes("Applied Name")).toBe(true);
    // Presence glyph is decorative only:
    expect(
      markup.includes('aria-hidden="true" class="branding-present-tag"'),
    ).toBe(true);
    // Override present → edit + clear actions offered:
    expect(markup.includes("Edit override…")).toBe(true);
    expect(markup.includes("Use company default…")).toBe(true);
  });
});
