import { describe, expect, it } from "vitest";

import { arTranslations } from "../ar";
import { enTranslations } from "../en";
import { activeShiftsAr, activeShiftsEn } from "./active-shifts-strings";
import { analyticsAr, analyticsEn } from "./analytics-strings";
import { brandingAr, brandingEn } from "./branding-strings";
import { foundationAr, foundationEn } from "./foundation-strings";
import {
  financialOverviewAr,
  financialOverviewEn,
} from "./financial-overview-strings";
import { incidentsAr, incidentsEn } from "./incidents-strings";
import { keysAr, keysEn } from "./keys-strings";
import {
  liveOperationsAr,
  liveOperationsEn,
} from "./live-operations-strings";
import { locationAr, locationEn } from "./location-strings";
import {
  locationSettingsAr,
  locationSettingsEn,
} from "./location-settings-strings";
import { mapSetupAr, mapSetupEn } from "./map-setup-strings";
import { overviewAr, overviewEn } from "./overview-strings";
import { reportsAr, reportsEn } from "./reports-strings";
import {
  retrievalQueueAr,
  retrievalQueueEn,
} from "./retrieval-queue-strings";
import { sessionsAr, sessionsEn } from "./sessions-strings";
import { sharedAr, sharedEn } from "./shared-strings";
import {
  subscriptionAr,
  subscriptionEn,
} from "./subscription-strings";
import { tasksAr, tasksEn } from "./tasks-strings";

/**
 * Structural guard for the split translation fragments.
 *
 * The aggregators compose these fragments with object spread, which would
 * silently overwrite duplicate keys, so this test pins the invariant the
 * compiler cannot express for spreads: fragment key sets stay pairwise
 * disjoint, every fragment keeps EN/AR key parity, and the composed
 * dictionaries contain exactly that disjoint union.
 */

const EN_FRAGMENTS = [
  ["activeShifts", activeShiftsEn],
  ["analytics", analyticsEn],
  ["branding", brandingEn],
  ["financialOverview", financialOverviewEn],
  ["foundation", foundationEn],
  ["incidents", incidentsEn],
  ["keys", keysEn],
  ["liveOperations", liveOperationsEn],
  ["location", locationEn],
  ["locationSettings", locationSettingsEn],
  ["mapSetup", mapSetupEn],
  ["overview", overviewEn],
  ["reports", reportsEn],
  ["retrievalQueue", retrievalQueueEn],
  ["sessions", sessionsEn],
  ["shared", sharedEn],
  ["subscription", subscriptionEn],
  ["tasks", tasksEn],
] as const;

const AR_FRAGMENTS = [
  ["activeShifts", activeShiftsAr],
  ["analytics", analyticsAr],
  ["branding", brandingAr],
  ["financialOverview", financialOverviewAr],
  ["foundation", foundationAr],
  ["incidents", incidentsAr],
  ["keys", keysAr],
  ["liveOperations", liveOperationsAr],
  ["location", locationAr],
  ["locationSettings", locationSettingsAr],
  ["mapSetup", mapSetupAr],
  ["overview", overviewAr],
  ["reports", reportsAr],
  ["retrievalQueue", retrievalQueueAr],
  ["sessions", sessionsAr],
  ["shared", sharedAr],
  ["subscription", subscriptionAr],
  ["tasks", tasksAr],
] as const;

describe("translation section composition guard", () => {
  it("every fragment holds only string values", () => {
    for (const [, fragment] of [...EN_FRAGMENTS, ...AR_FRAGMENTS]) {
      for (const value of Object.values(fragment)) {
        expect(typeof value).toBe("string");
      }
    }
  });

  it("every fragment has identical EN and AR key sets", () => {
    const enKeysByName = new Map(
      EN_FRAGMENTS.map(([name, fragment]) => [name, Object.keys(fragment).sort()]),
    );
    for (const [name, fragment] of AR_FRAGMENTS) {
      expect(Object.keys(fragment).sort()).toEqual(enKeysByName.get(name));
    }
    expect(enKeysByName.size).toBe(AR_FRAGMENTS.length);
  });

  it("fragment key sets are pairwise disjoint in both locales", () => {
    for (const fragments of [EN_FRAGMENTS, AR_FRAGMENTS]) {
      const owner = new Map<string, string>();
      for (const [name, fragment] of fragments) {
        for (const key of Object.keys(fragment)) {
          const existing = owner.get(key);
          if (existing !== undefined) {
            throw new Error(
              `duplicate translation key "${key}" in "${existing}" and "${name}"`,
            );
          }
          owner.set(key, name);
        }
      }
      expect(owner.size).toBeGreaterThan(0);
    }
  });

  it("composed dictionaries contain exactly the disjoint union of all fragments", () => {
    const composedByLocale = [
      [enTranslations, EN_FRAGMENTS],
      [arTranslations, AR_FRAGMENTS],
    ] as const;

    for (const [composed, fragments] of composedByLocale) {
      let expectedTotal = 0;
      const union = new Set<string>();
      for (const [, fragment] of fragments) {
        expectedTotal += Object.keys(fragment).length;
        for (const key of Object.keys(fragment)) {
          union.add(key);
        }
      }
      const composedKeys = Object.keys(composed);
      expect(composedKeys.length).toBe(expectedTotal);
      expect(new Set(composedKeys).size).toBe(union.size);
      for (const key of union) {
        expect(key in composed).toBe(true);
      }
    }
  });
});
