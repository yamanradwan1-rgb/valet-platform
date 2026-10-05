import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePresenceField } from "./shift-presence-policy-fields";
import {
  draftCenter,
  parseZoneDraft,
  zoneDraft,
} from "./shift-presence-zone-draft";
import { ShiftPresenceReadiness } from "./shift-presence-readiness";
import { ShiftPresenceExceptionFacts } from "./shift-presence-exception-facts";
import {
  presenceErrorKey,
  presenceOutcomeUnknown,
} from "./shift-presence-errors";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import {
  locationPolicy,
  presenceException,
} from "../../../../e2e/support/presence-data";

describe("Presence validated drafts and safe projections", () => {
  it.each(["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"])(
    "preserves mode %s without legacy boolean coercion",
    (mode) => {
      expect(parsePresenceField("shiftStartPresenceMode", mode)).toBe(mode);
      expect(parsePresenceField("shiftEndPresenceMode", mode)).toBe(mode);
    },
  );
  it.each(["", " ", "0", "201", "1.1", "NaN", "Infinity", "-1"])(
    "rejects accuracy %j",
    (value) => {
      expect(
        parsePresenceField("shiftPresenceMaxAccuracyMeters", value),
      ).toBeNull();
    },
  );
  it("preserves numeric bounds and independently bounds fix age", () => {
    expect(parsePresenceField("shiftPresenceMaxAccuracyMeters", "1")).toBe(1);
    expect(parsePresenceField("shiftPresenceMaxAccuracyMeters", "200")).toBe(
      200,
    );
    expect(parsePresenceField("shiftPresenceMaxFixAgeSeconds", "120")).toBe(
      120,
    );
    expect(
      parsePresenceField("shiftPresenceMaxFixAgeSeconds", "121"),
    ).toBeNull();
  });
  it("new zones have no fabricated center/radius/state and zeros are valid", () => {
    const blank = zoneDraft();
    expect(draftCenter(blank)).toBeNull();
    expect(parseZoneDraft(blank).success).toBe(false);
    const draft = {
      ...blank,
      label: "Lobby",
      code: "MAIN",
      latitude: "0",
      longitude: "0",
      radiusMeters: "5.5",
      state: "ACTIVE",
    };
    expect(draftCenter(draft)).toEqual({ lat: 0, lng: 0 });
    expect(parseZoneDraft(draft).success).toBe(true);
    for (const [key, value] of [
      ["radiusMeters", "1000.1"],
      ["latitude", "90.1"],
      ["longitude", "181"],
      ["latitude", "Infinity"],
      ["longitude", ""],
      ["label", " "],
    ]) {
      expect(parseZoneDraft({ ...draft, [key!]: value! }).success).toBe(false);
    }
  });
  it("uses server strict blockers, never active-count alone; no fingerprint shown", () => {
    const data = locationPolicy();
    data.effective.startMode = "REQUIRE";
    data.readiness = {
      ...data.readiness,
      applicability: "STRICT",
      activeZoneCount: 20,
      blockers: ["STRICT_ROLLOUT_CLOSED"],
    };
    const html = renderToStaticMarkup(
      <ShiftPresenceReadiness data={data} locale="en" />,
    );
    expect(html).toContain("Not ready");
    expect(html).toContain("Strict rollout remains closed");
    expect(html).not.toContain(data.readiness.configurationFingerprint);
  });
  it("renders only safe review facts in EN/AR and preserves LTR email", () => {
    for (const locale of ["en", "ar"] as const) {
      const html = renderToStaticMarkup(
        <ShiftPresenceExceptionFacts
          data={presenceException()}
          locationName="Hotel"
          locale={locale}
        />,
      );
      expect(html).toContain("Nadia Salem");
      expect(html).toContain('<bdi dir="ltr">nadia@example.com</bdi>');
      expect(html).not.toContain("bbbbbbbb");
      expect(html).not.toContain("configurationFingerprint");
    }
  });
  it("distinguishes exact-outcome uncertainty from definitive controlled rejection", () => {
    expect(
      presenceOutcomeUnknown(
        new DashboardApiError({ kind: "network", message: "private" }),
      ),
    ).toBe(true);
    expect(
      presenceOutcomeUnknown(
        new DashboardApiError({ kind: "malformed", message: "private" }),
      ),
    ).toBe(true);
    const error = new DashboardApiError({
      kind: "unknown",
      status: 503,
      code: "PRESENCE_SECURITY_UNAVAILABLE",
      message: "private",
    });
    expect(presenceOutcomeUnknown(error)).toBe(false);
    expect(presenceErrorKey(error)).toBe("securityError");
  });
});
