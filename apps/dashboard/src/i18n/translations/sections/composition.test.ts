import { describe, expect, it } from "vitest";

import { arTranslations } from "../ar";
import { enTranslations } from "../en";
import { activeShiftsAr, activeShiftsEn } from "./active-shifts-strings";
import { foundationAr, foundationEn } from "./foundation-strings";
import { incidentsAr, incidentsEn } from "./incidents-strings";
import { keysAr, keysEn } from "./keys-strings";
import { locationAr, locationEn } from "./location-strings";
import { overviewAr, overviewEn } from "./overview-strings";
import {
  retrievalQueueAr,
  retrievalQueueEn,
} from "./retrieval-queue-strings";
import { sessionsAr, sessionsEn } from "./sessions-strings";
import { sharedAr, sharedEn } from "./shared-strings";
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
  ["foundation", foundationEn],
  ["incidents", incidentsEn],
  ["keys", keysEn],
  ["location", locationEn],
  ["overview", overviewEn],
  ["retrievalQueue", retrievalQueueEn],
  ["sessions", sessionsEn],
  ["shared", sharedEn],
  ["tasks", tasksEn],
] as const;

const AR_FRAGMENTS = [
  ["activeShifts", activeShiftsAr],
  ["foundation", foundationAr],
  ["incidents", incidentsAr],
  ["keys", keysAr],
  ["location", locationAr],
  ["overview", overviewAr],
  ["retrievalQueue", retrievalQueueAr],
  ["sessions", sessionsAr],
  ["shared", sharedAr],
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
