import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioZoneMap } from "./StudioZoneMap";
import { ZonesPane } from "./ZonesPane";
import { zone } from "./studio-zone-map-test-sdk";

const context = vi.hoisted(() => ({
  unavailable: false,
  locale: "en" as "en" | "ar",
  setDirty: vi.fn(),
}));
vi.mock("../../../../lib/theme/theme-provider", () => ({
  useDashboardTheme: () => ({ theme: "dark" }),
}));
vi.mock("./studio-context", () => ({
  useStudio: () => ({
    locale: context.locale,
    adapter: {
      presence: { zones: [], unavailable: context.unavailable, busy: false },
    },
    editable: false,
    setDirty: context.setDirty,
    identity: "test-scope",
    announce: vi.fn(),
  }),
}));

beforeEach(() => {
  context.unavailable = false;
  context.locale = "en";
});

describe("Policies Studio map presentation", () => {
  it.each(["en", "ar"] as const)(
    "production pane uses geographic Google Maps in %s without the illustrative diagram",
    (locale) => {
      context.locale = locale;
      const html = renderToStaticMarkup(<ZonesPane />);
      expect(html).toContain('class="ps-zone-map"');
      expect(html).toContain(locale === "en" ? "Google Maps" : "خريطة Google");
      expect(html).not.toMatch(
        /OfflineMap|ps-offline-map|Illustrative|schematic|Building|Court/,
      );
      expect(html).toContain('dir="ltr"');
    },
  );

  it("retires the entire map and protected draft editor on real scope unavailability", () => {
    context.unavailable = true;
    const html = renderToStaticMarkup(<ZonesPane />);
    expect(html).toContain("unavailable for this scope");
    expect(html).not.toContain("ps-zone-map");
    expect(html).not.toContain("ps-zone-form");
  });

  it("initially announces loading and a truthful empty world viewport", () => {
    const html = renderToStaticMarkup(
      <StudioZoneMap
        zones={[]}
        selectedId={null}
        draft={null}
        editable={false}
        onPick={vi.fn()}
        locale="en"
        theme="light"
        scopeIdentity="test"
      />,
    );
    expect(html).toContain("Loading Google Maps");
    expect(html).toContain("no Location center is assumed");
    expect(html).not.toContain("31.95");
  });

  it("explains invalid draft geometry and explicit Save without claiming a saved zone", () => {
    const html = renderToStaticMarkup(
      <StudioZoneMap
        zones={[]}
        selectedId={null}
        draft={{ ...zone, latitude: NaN }}
        editable={true}
        onPick={vi.fn()}
        locale="en"
        theme="dark"
        scopeIdentity="test"
      />,
    );
    expect(html).toContain("Enter valid coordinates");
    expect(html).toContain("Unsaved draft");
    expect(html).toContain("Map selection does not save");
    expect(html).toContain("Saved zones: 0");
  });
});
