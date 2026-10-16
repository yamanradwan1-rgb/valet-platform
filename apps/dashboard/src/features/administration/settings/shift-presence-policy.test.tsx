import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShiftPresencePolicy, type PresencePolicyDrafts } from "./shift-presence-policy";
import {
  parsePresenceField,
  presencePolicyContext,
  presencePolicyFieldIdentity,
  presencePolicyIntent,
  presenceFields,
  presenceFieldSnapshot,
  requiresStrictPresenceConfirmation,
} from "./shift-presence-policy-fields";
import type { PresenceCompany, PresenceLocation, PresenceApi } from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import { companyPolicy, locationPolicy } from "../../../../e2e/support/presence-data";

// This suite verifies policy HTML and field semantics. Contextual Help's
// authenticated dialog/focus lifecycle is exercised by its own browser suites.
vi.mock("../../help/scoped-context-help", () => ({
  ScopedContextHelp: () => null,
}));
vi.mock("./mobile-setting-context-help", () => ({
  MobileSettingContextHelp: () => null,
}));

function markup(
  data: PresenceCompany | PresenceLocation,
  drafts?: PresencePolicyDrafts,
  locale: "en" | "ar" = "en",
  mode: "DIRECT_MANAGEMENT" | "GUIDED_SETUP" = "DIRECT_MANAGEMENT",
) {
  return renderToStaticMarkup(
    <ShiftPresencePolicy
      api={{} as PresenceApi}
      data={data}
      locale={locale}
      mutation={{ blocked: false } as PresenceMutation}
      loading={false}
      mode={mode}
      {...(drafts ? { drafts } : {})}
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
    expect(html).toContain("No override saved");
    expect(html).toContain("Clear Override");
    expect(html).toContain("Saved on server");
    expect(html).toContain("Inherited");
    expect(html).toContain("Overridden");
  });

  it("never fabricates inherited/Location state on Company default-only tab", () => {
    const html = markup(companyPolicy());
    expect(html).toContain("Company defaults apply");
    expect(html).not.toContain("Clear Override");
    expect(html).not.toContain("No override saved");
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
        source: "CUSTOM",
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
        source: "CUSTOM",
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

  it("exposes independent source selectors for all four Location fields", () => {
    const html = markup(locationPolicy());
    for (const field of presenceFields) {
      expect(html).toContain(`data-testid="presence-inheritance-${field.field}"`);
      expect(html).toContain(`id="presence-${field.field}-source"`);
    }
    expect((html.match(/Use Company Default/g) ?? []).length).toBe(4);
    expect((html.match(/Customize for This Location/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(markup(companyPolicy())).not.toContain("presence-inheritance-");
  });

  it("GUIDED_SETUP stages drafts and renders no mutation actions or strict submit", () => {
    const data = locationPolicy();
    const draft = policyDraft(data, "shiftStartPresenceMode", "CUSTOM", "REQUIRE");
    const html = markup(data, { shiftStartPresenceMode: draft }, "en", "GUIDED_SETUP");
    expect(html).toContain("These changes are drafts only");
    expect(html).toContain("Unsaved draft");
    expect(html).not.toMatch(/<button[^>]*>Save<\/button>/);
    expect(html).not.toMatch(/<button[^>]*>Clear Override<\/button>/);
    expect(html).not.toContain("Confirm this strict change");
    expect(markup(data)).toMatch(/<button[^>]*>Save<\/button>/);
  });

  it("explicit CUSTOM equal to inherited Company value must stage SET", () => {
    const data = locationPolicy(); // saved source INHERIT; Company and effective OFF.
    const draft = policyDraft(data, "shiftStartPresenceMode", "CUSTOM", "OFF");
    expect(presencePolicyIntent(data, presenceFields[0], draft)).toMatchObject({
      kind: "SET", value: "OFF", savedSource: "INHERIT", proposedSource: "CUSTOM",
    });
    expect(presencePolicyIntent(data, presenceFields[0], {
      ...draft, touched: false,
    }).kind).toBe("NONE"); // Merely opening must not save.
    expect(presencePolicyIntent(data, presenceFields[0], null).kind).toBe("NONE");
  });

  it("INHERIT stages CLEAR only when server has a saved override, never treats OFF as inherit", () => {
    const data = locationPolicy();
    data.overrides.startModeOverride = "OFF"; // equal to Company, but still explicit.
    const draft = policyDraft(data, "shiftStartPresenceMode", "INHERIT", "OFF");
    expect(presencePolicyIntent(data, presenceFields[0], draft)).toMatchObject({
      kind: "CLEAR", savedSource: "CUSTOM", proposedSource: "INHERIT",
    });
    data.overrides.startModeOverride = null;
    const next = policyDraft(data, "shiftStartPresenceMode", "INHERIT", "OFF");
    expect(presencePolicyIntent(data, presenceFields[0], next).kind).toBe("NONE");
  });

  it("source + value intents are independent for all four nullable Location fields", () => {
    const data = locationPolicy();
    const expected = ["OFF", "WARN_ONLY", "200", "120"];
    for (const [index, field] of presenceFields.entries()) {
      const draft = policyDraft(data, field.field, "CUSTOM", expected[index]);
      const result = presencePolicyIntent(data, field, draft);
      expect(result.kind).toBe("SET");
      if (result.kind === "SET")
        expect(result.value).toBe(index === 0 ? "OFF" : index === 1
          ? "WARN_ONLY" : Number(expected[index]));
    }
    expect(data.overrides).toMatchObject({
      startModeOverride: null, endModeOverride: null,
      maxAccuracyMetersOverride: null, maxFixAgeSecondsOverride: null,
    }); // Pure intent never mutates canonical server state.
  });

  it("rejects invalid CUSTOM input and changed revision/fingerprint without rebase", () => {
    const data = locationPolicy();
    const draft = policyDraft(data, "shiftPresenceMaxAccuracyMeters", "CUSTOM", "201");
    expect(presencePolicyIntent(data, presenceFields[2], draft).kind).toBe("INVALID");
    const valid = { ...draft, draft: "50" };
    data.company.revision += 1;
    expect(presencePolicyIntent(data, presenceFields[2], valid).kind).toBe("CONFLICT");
    const newDraft = policyDraft(data, "shiftPresenceMaxAccuracyMeters", "CUSTOM", "50");
    data.readiness.configurationFingerprint = "b".repeat(64);
    expect(presencePolicyIntent(data, presenceFields[2], newDraft).kind).toBe("CONFLICT");
  });
});

function policyDraft(
  data: PresenceCompany | PresenceLocation,
  fieldId: (typeof presenceFields)[number]["field"],
  source: "INHERIT" | "CUSTOM",
  value: string,
) {
  const field = presenceFields.find((entry) => entry.field === fieldId)!;
  const { effectiveValue: saved, override } = presenceFieldSnapshot(data, field);
  return {
    source, draft: value, touched: true,
    baselineKey: presencePolicyFieldIdentity(presencePolicyContext(data), saved, override),
    baselineValue: saved, baselineOverride: override,
  };
}
