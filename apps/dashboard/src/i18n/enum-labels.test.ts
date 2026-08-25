import { describe, expect, it } from "vitest";

import { arTranslations } from "./translations/ar";
import { enTranslations } from "./translations/en";
import type { TranslationKey } from "./translations/types";

/**
 * Every enum label key must resolve to a real string in BOTH dictionaries so
 * no raw developer enum or missing Arabic label can ever reach the UI.
 */
const REQUIRED_LABEL_KEYS: readonly TranslationKey[] = [
  // Session states (all nine accepted backend states)
  "enum.session.CHECKING_IN",
  "enum.session.AWAITING_PARKING",
  "enum.session.PARKING",
  "enum.session.PARKED",
  "enum.session.REQUESTED",
  "enum.session.RETRIEVING",
  "enum.session.READY",
  "enum.session.HANDOFF_PENDING",
  "enum.session.COMPLETED",
  // Payment statuses (incl. D1 polish corrections)
  "enum.payment.NOT_REQUIRED",
  "enum.payment.UNPAID",
  "enum.payment.PENDING",
  "enum.payment.PAID",
  "enum.payment.FAILED",
  // Freshness
  "enum.freshness.LIVE",
  "enum.freshness.STALE",
];

describe("dictionary parity", () => {
  it("has identical key sets in EN and AR", () => {
    const enKeys = Object.keys(enTranslations).sort();
    const arKeys = Object.keys(arTranslations).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it("resolves all required enum labels in both locales", () => {
    for (const key of REQUIRED_LABEL_KEYS) {
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
    }
  });

  it("renders no raw underscore enum values in either locale", () => {
    for (const dictionary of [enTranslations, arTranslations]) {
      for (const key of REQUIRED_LABEL_KEYS) {
        expect(dictionary[key]).not.toMatch(/_/u);
      }
    }
  });
});
