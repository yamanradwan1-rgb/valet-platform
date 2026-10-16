import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShiftPresencePolicy, type PresencePolicyDrafts } from "./shift-presence-policy";
import {
  parsePresenceField,
  presencePolicyContext,
  presencePolicyFieldIdentity,
  requiresStrictPresenceConfirmation,
} from "./shift-presence-policy-fields";
import type { PresenceCompany, PresenceLocation, PresenceApi } from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import { companyPolicy, locationPolicy } from "../../../../e2e/support/presence-data";

function markup(
  data: PresenceCompany | PresenceLocation,
  drafts?: PresencePolicyDrafts,
  locale: "en" | "ar" = "en",
) {
  return renderToStaticMarkup(
    <ShiftPresencePolicy
      api={{} as PresenceApi}
      data={data}
      locale={locale}
      mutation={{ blocked: false } as PresenceMutation}
      loading={false}
      drafts={drafts}
      onDraftChange={() => {}}
    />,
  );
}

describe("Shift Presence policy — owned W3 fields", () => {
  it("offers all independent Start/End choices and progressive numeric limits", () => {
    const html = markup(locationPolicy());
    expect(html).toContain('data-presence-field="shiftStartPresenceMode"');
    expect(html).toContain('data-presence-field="shiftEndPresenceMode"');
    expect(html).toContain('data-presence-field="shiftPresenceMaxAccuracyMeters"');
    expect(html).toContain('data-presence-field="shiftPresenceMaxFixAgeSeconds"');
    expect(html).toContain("Advanced · GPS evidence limits");
    expect(html).toContain("<details");
    expect(html).toContain("Require or override");
    expect(html).toContain("Warn only");
  });

  it("shows independent inherited source, company and saved effective values", () => {
    const data = locationPolicy();
    data.company.startMode = "WARN_ONLY";
    data.effective.startMode = "WARN_ONLY";
    data.overrides.endModeOverride = "REQUIRE";
    data.effective.endMode = "REQUIRE";
    const html = markup(data);
    expect(html).toContain("No Location override saved");
    expect(html).toContain("Clear Override");
    expect(html).toContain("Saved on server");
    expect(html).toContain("Inherited");
    expect(html).toContain("Overridden");
  });

  it("never fabricates inherited/Location state on Company default-only tab", () => {
    const html = markup(companyPolicy());
    expect(html).toContain("Company defaults apply");
    expect(html).not.toContain("Clear Override");
    expect(html).not.toContain("No Location override saved");
  });

  it("respects persisted role capabilities and read-only loading", () => {
    const data = locationPolicy();
    data.capabilities.canEdit = false;
    const html = markup(data);
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain("Confirm this strict change");
  });

  it("shows parent-owned unsaved draft but never changes saved projection", () => {
    const data = locationPolicy();
    const baselineKey = presencePolicyFieldIdentity(
      presencePolicyContext(data), data.effective.startMode, data.overrides.startModeOverride,
    );
    const drafts: PresencePolicyDrafts = {
      shiftStartPresenceMode: {
        draft: "REQUIRE_OR_OVERRIDE",
        touched: true,
        baselineKey,
        baselineValue: "OFF",
        baselineOverride: null,
      },
    };
    const html = markup(data, drafts);
    expect(html).toContain("Unsaved draft");
    expect(html).toContain("Saved on server");
    expect(html).toContain("Require or override");
    expect(html).not.toContain("Another change occurred");
  });

  it("remount with a changed server revision shows conflict and keeps draft", () => {
    const original = locationPolicy();
    const data = locationPolicy();
    data.overrides.revision += 1;
    data.effective.startMode = "WARN_ONLY";
    data.overrides.startModeOverride = "WARN_ONLY";
    const drafts: PresencePolicyDrafts = {
      shiftStartPresenceMode: {
        draft: "REQUIRE",
        touched: true,
        baselineKey: presencePolicyFieldIdentity(
          presencePolicyContext(original),
          original.effective.startMode,
          original.overrides.startModeOverride,
        ),
        baselineValue: "OFF",
        baselineOverride: null,
      },
    };
    const html = markup(data, drafts);
    expect(html).toContain("Another change occurred");
    expect(html).toContain("Review current state and reapply draft");
    expect(html).toContain("Unsaved draft");
    expect(html).toContain('disabled=""');
  });

  it("fresh scope with empty keyed parent drafts never resurrects an old draft", () => {
    const alternate = locationPolicy();
    alternate.locationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const html = markup(alternate, {});
    expect(html).toContain("No pending change");
    expect(html).not.toContain("Unsaved draft");
    expect(html).not.toContain("Another change occurred");
  });

  it("supports exact role-neutral field limits, and rejects non-decimal text", () => {
    for (const mode of ["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"]) {
      expect(parsePresenceField("shiftStartPresenceMode", mode)).toBe(mode);
      expect(parsePresenceField("shiftEndPresenceMode", mode)).toBe(mode);
    }
    for (const field of ["shiftPresenceMaxAccuracyMeters", "shiftPresenceMaxFixAgeSeconds"] as const) {
      expect(parsePresenceField(field, "1")).toBe(1);
      for (const invalid of ["0", "-1", "1.1", "0x10", "1e2", "Infinity", ""]) {
        expect(parsePresenceField(field, invalid)).toBeNull();
      }
    }
    expect(parsePresenceField("shiftPresenceMaxAccuracyMeters", "200")).toBe(200);
    expect(parsePresenceField("shiftPresenceMaxAccuracyMeters", "201")).toBeNull();
    expect(parsePresenceField("shiftPresenceMaxFixAgeSeconds", "120")).toBe(120);
    expect(parsePresenceField("shiftPresenceMaxFixAgeSeconds", "121")).toBeNull();
  });

  it("requires explicit confirmation only for entering/changing strict state", () => {
    expect(requiresStrictPresenceConfirmation("OFF", "REQUIRE")).toBe(true);
    expect(requiresStrictPresenceConfirmation("WARN_ONLY", "REQUIRE_OR_OVERRIDE")).toBe(true);
    expect(requiresStrictPresenceConfirmation("OFF", "OFF")).toBe(false);
    expect(requiresStrictPresenceConfirmation("REQUIRE", "REQUIRE")).toBe(false);
    expect(requiresStrictPresenceConfirmation("OFF", "WARN_ONLY")).toBe(false);
    expect(requiresStrictPresenceConfirmation("REQUIRE", "REQUIRE", true)).toBe(true);
  });

  it("renders Arabic guidance without changing numeric bounds or modes", () => {
    const html = markup(locationPolicy(), {}, "ar");
    expect(html).toContain("إعدادات متقدمة");
    expect(html).toContain("حضور");
  });
});
