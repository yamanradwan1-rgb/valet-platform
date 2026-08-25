import { describe, expect, it } from "vitest";

import {
  locationMapAreaPurposeSchema,
  locationMapPointKindSchema,
} from "@valet/contracts";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import {
  areaPurposeLabelKey,
  pointKindLabelKey,
} from "../../i18n/enum-labels";

/**
 * Guards the exact backend enum surface for map setup. If the contract ever
 * adds a kind/purpose, these assertions fail until the dashboard gives it a
 * friendly label — no raw enum codes and no invented kinds.
 */
describe("map setup enum surface", () => {
  it("supports exactly the verified point kinds", () => {
    expect([...locationMapPointKindSchema.options].sort()).toEqual([
      "DROP_OFF",
      "ENTRANCE",
      "PICKUP",
    ]);
  });

  it("supports exactly the verified area purposes", () => {
    expect([...locationMapAreaPurposeSchema.options].sort()).toEqual([
      "OVERFLOW",
      "PARKING",
      "RESTRICTED",
      "STAGING",
    ]);
  });

  it("does not invent unsupported point kinds", () => {
    for (const invented of [
      "VALET_DESK",
      "EXIT",
      "LOBBY",
      "EV_CHARGER",
      "GARAGE",
    ]) {
      expect(
        locationMapPointKindSchema.safeParse(invented).success,
      ).toBe(false);
    }
  });

  it("maps every point kind to a label key in both locales", () => {
    for (const kind of locationMapPointKindSchema.options) {
      const key = pointKindLabelKey(kind);
      expect(enTranslations[key]).toMatch(/\S/);
      expect(arTranslations[key]).toMatch(/\S/);
    }
  });

  it("maps every area purpose to a label key in both locales", () => {
    for (const purpose of locationMapAreaPurposeSchema.options) {
      const key = areaPurposeLabelKey(purpose);
      expect(enTranslations[key]).toMatch(/\S/);
      expect(arTranslations[key]).toMatch(/\S/);
    }
  });

  it("keeps labels distinct so users can tell kinds apart", () => {
    const en = new Set(
      locationMapPointKindSchema.options.map((kind) =>
        enTranslations[pointKindLabelKey(kind)],
      ),
    );
    const purposes = new Set(
      locationMapAreaPurposeSchema.options.map((value) =>
        enTranslations[areaPurposeLabelKey(value)],
      ),
    );
    expect(en.size).toBe(locationMapPointKindSchema.options.length);
    expect(purposes.size).toBe(locationMapAreaPurposeSchema.options.length);
  });
});

describe("map setup translation fragment parity", () => {
  const REQUIRED_KEYS = [
    "mapSetup.note",
    "mapSetup.tab.points",
    "mapSetup.tab.areas",
    "mapSetup.empty.all",
    "mapSetup.empty.points",
    "mapSetup.empty.areas",
    "mapSetup.action.addPoint",
    "mapSetup.action.addArea",
    "mapSetup.action.replaceVertices",
    "mapSetup.confirm.deactivateBody",
    "mapSetup.confirm.replaceBody",
    "mapSetup.detail.separateOperationsNote",
    "mapSetup.editor.verticesFormat",
    "mapSetup.validation.verticesMinimum",
    "mapSetup.errors.conflict",
    "mapSetup.state.active",
    "mapSetup.state.inactive",
    "mapSetup.refresh.failed",
  ] as const;

  it("provides every required key with EN/AR parity and content", () => {
    for (const key of REQUIRED_KEYS) {
      expect(typeof enTranslations[key]).toBe("string");
      expect(typeof arTranslations[key]).toBe("string");
      expect((enTranslations[key] ?? "").length).toBeGreaterThan(0);
      expect((arTranslations[key] ?? "").length).toBeGreaterThan(0);
    }
  });
});
