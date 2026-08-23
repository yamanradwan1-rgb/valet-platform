import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppHeader } from "./app-header";

describe("AppHeader Component", () => {
  it("renders live location and role without prototype fallbacks in live mode", () => {
    const markup = renderToStaticMarkup(
      <AppHeader
        mode="live"
        locationName="Amman Rotana"
        locationCode="ROT-01"
        role="VALET_SUPERVISOR"
      />,
    );

    expect(markup).toContain("Amman Rotana");
    expect(markup).toContain("ROT-01");
    expect(markup).toContain("VS");
    expect(markup).not.toContain("Four Seasons Amman");
    expect(markup).not.toContain("Main Entrance");
    expect(markup).not.toContain("MK");
  });

  it("never falls back to MK or Four Seasons in live mode when props are undefined", () => {
    const markup = renderToStaticMarkup(
      <AppHeader
        mode="live"
        locationName={undefined}
        locationCode={undefined}
        role={undefined}
      />,
    );

    expect(markup).not.toContain("Four Seasons Amman");
    expect(markup).not.toContain("Main Entrance");
    expect(markup).not.toContain("MK");
  });

  it("renders prototype values in prototype mode", () => {
    const markup = renderToStaticMarkup(<AppHeader mode="prototype" />);
    expect(markup).toContain("Four Seasons Amman");
    expect(markup).toContain("Main Entrance");
    expect(markup).toContain("MK");
  });
});
