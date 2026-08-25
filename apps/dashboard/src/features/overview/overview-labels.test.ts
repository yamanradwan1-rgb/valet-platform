import { describe, expect, it } from "vitest";

import { dashboardSessionStateSchema } from "@valet/contracts";

import { sessionStateLabelKey } from "../../i18n/enum-labels";
import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import type { TranslationKey } from "../../i18n/translations/types";

/**
 * Overview EN/AR label guarantees: every canonical backend session state
 * (including COMPLETED, which stays valid in state counts) resolves to a real
 * human-readable label in both locales — never a raw underscore enum code.
 */

const ARABIC_LETTER = /[\u0600-\u06FF]/u;

const OVERVIEW_LABEL_KEYS: readonly TranslationKey[] = [
  "overview.kpi.vehiclesInService",
  "overview.kpi.vehiclesInServiceSub",
  "overview.kpi.activeRetrievals",
  "overview.kpi.oldestWait",
  "overview.kpi.locationCurrency",
  "overview.states.title",
  "overview.financial.snapshotTitle",
];

describe("overview session-state labels", () => {
  it("covers exactly the nine canonical contract states", () => {
    const states = [...dashboardSessionStateSchema.options].sort();
    expect(states).toEqual(
      [
        "AWAITING_PARKING",
        "CHECKING_IN",
        "COMPLETED",
        "HANDOFF_PENDING",
        "PARKED",
        "PARKING",
        "READY",
        "REQUESTED",
        "RETRIEVING",
      ].sort(),
    );
    for (const state of states) {
      const key = sessionStateLabelKey(state);
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
    }
  });

  it("renders no raw underscore enum codes as labels", () => {
    for (const state of dashboardSessionStateSchema.options) {
      const key = sessionStateLabelKey(state);
      expect(enTranslations[key]).not.toMatch(/_/u);
      expect(arTranslations[key]).not.toMatch(/_/u);
    }
  });

  it("provides genuinely Arabic labels in the AR dictionary", () => {
    for (const state of dashboardSessionStateSchema.options) {
      expect(arTranslations[sessionStateLabelKey(state)]).toMatch(ARABIC_LETTER);
    }
  });
});

describe("overview surface labels", () => {
  it("resolves every overview key in both locales", () => {
    for (const key of OVERVIEW_LABEL_KEYS) {
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
    }
  });

  it("localizes Arabic KPI labels with Arabic script", () => {
    for (const key of OVERVIEW_LABEL_KEYS) {
      expect(arTranslations[key]).toMatch(ARABIC_LETTER);
    }
  });
});
