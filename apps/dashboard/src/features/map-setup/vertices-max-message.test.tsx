import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { LocationMapArea } from "@valet/contracts";

import { LocaleProvider } from "../../i18n/locale-provider";
import { VerticesSheet } from "./vertices-sheet";

/**
 * Vertex-count validation copy (D5-001): the replacement sheet previously
 * showed the MINIMUM wording ("At least 3 vertices are required.") for ANY
 * out-of-range count, including the >500 maximum violation. The copy must
 * name the rule actually violated, mirroring AreaCreateSheet's ternary.
 */

function areaWithVertices(count: number): LocationMapArea {
  return {
    active: true,
    code: "A1",
    id: "11111111-1111-4111-8111-111111111111",
    label: "Zone A",
    parkingZoneId: null,
    vertices: Array.from({ length: count }, (_, index) => ({
      latitude: 24.71 + index * 0.0001,
      longitude: 46.67 + index * 0.0001,
    })),
  } as unknown as LocationMapArea;
}

function renderSheet(area: LocationMapArea): string {
  return renderToStaticMarkup(
    <LocaleProvider>
      <VerticesSheet
        area={area}
        errorMessage={null}
        onClose={() => undefined}
        onReplace={() => undefined}
        saving={false}
      />
    </LocaleProvider>,
  );
}

describe("vertices sheet validation copy", () => {
  it("names the MAXIMUM rule when over 500 well-formed vertices are entered", () => {
    const markup = renderSheet(areaWithVertices(501));
    expect(markup.includes("No more than 500 vertices are allowed.")).toBe(
      true,
    );
    expect(markup.includes("At least 3 vertices are required.")).toBe(false);
  });

  it("names the MINIMUM rule when fewer than 3 vertices are present", () => {
    const markup = renderSheet(areaWithVertices(2));
    expect(markup.includes("At least 3 vertices are required.")).toBe(true);
    expect(markup.includes("No more than 500 vertices are allowed.")).toBe(
      false,
    );
  });
});
