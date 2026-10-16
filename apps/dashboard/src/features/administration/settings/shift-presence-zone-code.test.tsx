import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AttendanceZonesOverviewMap } from "./attendance-zones-overview-map";
import { editZoneDraft, suggestZoneCode } from "./shift-presence-zone-code";
import { parseZoneDraft, zoneDraft } from "./shift-presence-zone-draft";

describe("Shift Presence map-first zone editing", () => {
  it("offers editable Latin and Arabic-fallback labels without saving", () => {
    expect(suggestZoneCode("Main Lobby Entrance")).toBe("MAIN_LOBBY_ENTRANCE");
    expect(suggestZoneCode("المدخل الشمالي")).toBe("ALMDKHL_ALSHMALY");
    expect(suggestZoneCode("  ")).toBe("");

    const start = zoneDraft();
    const withLabel = editZoneDraft(start, "label", "North gate", true);
    expect(withLabel.code).toBe("NORTH_GATE");
    expect(editZoneDraft(withLabel, "label", "Renamed gate", false).code).toBe(
      "NORTH_GATE",
    );
    expect(editZoneDraft(withLabel, "code", "CUSTOM", false).code).toBe(
      "CUSTOM",
    );
  });

  it.each(["5", "5.125", "77.25", "999.9", "1000"])(
    "accepts radius %s through existing typed API contract",
    (radiusMeters) => {
      const data = {
        ...zoneDraft(),
        label: "Gate",
        code: "GATE",
        latitude: "32.556",
        longitude: "35.862",
        radiusMeters,
        state: "ACTIVE",
      };
      expect(parseZoneDraft(data).success).toBe(true);
    },
  );

  it.each(["", "4.999", "1000.001", "Infinity", "NaN"])(
    "blocks unsupported radius %s before any mutation",
    (radiusMeters) => {
      expect(
        parseZoneDraft({
          label: "Gate",
          code: "GATE",
          latitude: "32.556",
          longitude: "35.862",
          radiusMeters,
          state: "ACTIVE",
        }).success,
      ).toBe(false);
    },
  );

  it("renders an accessible server-snapshot map and manual fallback in EN and AR", () => {
    for (const locale of ["en", "ar"] as const) {
      const markup = renderToStaticMarkup(
        <AttendanceZonesOverviewMap
          zones={[]}
          locale={locale}
          theme="dark"
        />,
      );
      expect(markup).toContain('role="img"');
      expect(markup).toContain('role="status"');
      expect(markup).toContain(
        locale === "en" ? "saved attendance zones" : "المناطق المحفوظة",
      );
      expect(markup).not.toContain("getCurrentPosition");
    }
  });
});
