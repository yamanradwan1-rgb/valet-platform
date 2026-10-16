import { describe, expect, it } from "vitest";
import {
  guidedPresenceCopy,
  type GuidedPresenceCopyKey,
} from "./shift-presence-guided-copy";

const allKeys = [
  "title",
  "intro",
  "scopeStep",
  "zonesStep",
  "policyStep",
  "reviewStep",
  "scopeTitle",
  "scopeHelp",
  "companyScope",
  "locationScope",
  "checkAtActionsOnly",
  "zonesHelp",
  "policyHelp",
  "stagedOnly",
  "reviewTitle",
  "reviewHelp",
  "savedVsProposed",
  "setting",
  "savedValue",
  "proposedValue",
  "savedSource",
  "proposedSource",
  "inherit",
  "custom",
  "unchanged",
  "noChanges",
  "unsaved",
  "pendingFields",
  "invalidDraft",
  "staleDraft",
  "contextChanged",
  "strictZoneHint",
  "strictRisk",
  "strictApproval",
  "strictStart",
  "strictEnd",
  "offOffSafe",
  "preflight",
  "preflightHelp",
  "reviewButton",
  "confirmTitle",
  "confirmHelp",
  "confirmStrict",
  "confirmButton",
  "applyButton",
  "applying",
  "committed",
  "notCommitted",
  "applyComplete",
  "partial",
  "partialHelp",
  "unknown",
  "unknownHelp",
  "conflict",
  "conflictHelp",
  "mfaRequired",
  "mfaHelp",
  "denied",
  "deniedHelp",
  "serverNotReady",
  "serverNotReadyHelp",
  "retryAfterRefresh",
  "reconcile",
  "reconcileHelp",
  "stopNoReplay",
  "cancel",
  "close",
  "previous",
  "next",
  "backToPolicy",
  "backToOverview",
  "refresh",
  "requiredZone",
  "serverTruth",
  "scopeReset",
  "noAggregateSave",
  "notStarted",
  "cannotConfirm",
  "compareChanged",
] as const satisfies readonly GuidedPresenceCopyKey[];

describe("Shift Presence guided setup copy", () => {
  it("has usable complete bilingual labels and accessible action text", () => {
    for (const locale of ["en", "ar"] as const) {
      const t = guidedPresenceCopy(locale);
      for (const key of allKeys) {
        const value = t(key);
        expect(value, `${locale}:${key}`).toBeTruthy();
        expect(value.trim(), `${locale}:${key}`).toBe(value);
        expect(value, `${locale}:${key}`).not.toMatch(
          /<[^>]+>|undefined|\[object Object\]/u,
        );
      }
      for (const key of [
        "scopeStep",
        "zonesStep",
        "policyStep",
        "reviewStep",
        "reviewButton",
        "confirmButton",
        "applyButton",
        "cancel",
        "close",
        "previous",
        "next",
        "refresh",
      ] as const) {
        expect(t(key).length, `${locale}:${key}`).toBeLessThan(90);
      }
      expect(t("savedValue")).not.toBe(t("proposedValue"));
      expect(t("savedSource")).not.toBe(t("proposedSource"));
      expect(t("inherit")).not.toBe(t("custom"));
    }
    expect(allKeys.length).toBeGreaterThan(65);
    expect(new Set(allKeys).size).toBe(allKeys.length);
    expect(guidedPresenceCopy("en")("confirmButton")).toMatch(/Confirm/u);
    expect(guidedPresenceCopy("ar")("confirmButton")).toMatch(/تأكيد/u);
    expect(guidedPresenceCopy("ar")("savedVsProposed")).toMatch(
      /\p{Script=Arabic}/u,
    );
  });

  it("does not misrepresent navigation, draft, independent saves or OFF/OFF", () => {
    const en = guidedPresenceCopy("en");
    expect(en("policyHelp")).toMatch(/does not save or clear/u);
    expect(en("stagedOnly")).toMatch(/no policy write/u);
    expect(en("confirmHelp")).toMatch(/independent field attempts/u);
    expect(en("noAggregateSave")).toMatch(/independent per field/u);
    expect(en("offOffSafe")).toMatch(/no attendance zone/u);
    expect(en("serverTruth")).toMatch(/Only server-confirmed data/u);
    expect(en("zonesHelp")).toMatch(/Save each attendance zone individually/u);
    expect(en("checkAtActionsOnly")).toMatch(/does not enable continuous/u);
    expect(en("strictStart")).not.toBe(en("strictEnd"));
  });

  it("distinguishes partial, unknown, conflict, MFA and denied results", () => {
    for (const locale of ["en", "ar"] as const) {
      const t = guidedPresenceCopy(locale);
      for (const key of [
        "partial",
        "unknown",
        "conflict",
        "mfaRequired",
        "denied",
        "serverNotReady",
        "notCommitted",
        "committed",
      ] as const) {
        expect(t(key)).not.toBe(t("applyComplete"));
      }
      expect(t("reconcile")).not.toBe(t("applyButton"));
      expect(t("unknownHelp")).not.toBe(t("reconcileHelp"));
    }
    const en = guidedPresenceCopy("en");
    expect(en("unknownHelp")).toMatch(/original mutation ID read-only/u);
    expect(en("unknownHelp")).toMatch(/do not issue/u);
    expect(en("reconcileHelp")).toMatch(/never replays a write/u);
    expect(en("partialHelp")).toMatch(/Only confirmed fields are saved/u);
    expect(en("conflictHelp")).toMatch(/Stop applying/u);
    expect(en("mfaHelp")).toMatch(/Do not automatically retry/u);
    expect(en("deniedHelp")).toMatch(/Stop applying/u);
    expect(en("contextChanged")).toMatch(/fingerprint/u);
    expect(en("preflightHelp")).toMatch(/Before every protected field write/u);
  });
});
