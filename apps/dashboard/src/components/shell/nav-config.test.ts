import { describe, expect, it } from "vitest";

import { enTranslations } from "../../i18n/translations/en";
import { arTranslations } from "../../i18n/translations/ar";
import type { TranslationKey } from "../../i18n/translations/types";
import { FORBIDDEN_NAV_PATHS, NAV_SECTIONS } from "./nav-config";

const EXPECTED_PATHS = [
  "/overview",
  "/live-operations",
  "/sessions",
  "/retrieval-queue",
  "/tasks",
  "/active-shifts",
  "/keys",
  "/incidents",
  "/maps-zones",
  "/financial",
  "/analytics",
  "/reports",
  "/location-settings",
  "/branding",
  "/subscription",
];

function navPaths(): string[] {
  return NAV_SECTIONS.flatMap((section) =>
    section.items.map((item) => item.path),
  );
}

describe("dashboard navigation surface", () => {
  it("contains exactly the accepted final-D1 surfaces", () => {
    expect(navPaths().sort()).toEqual([...EXPECTED_PATHS].sort());
  });

  it("exposes no forbidden standalone/admin surfaces", () => {
    const paths = navPaths();
    for (const forbidden of FORBIDDEN_NAV_PATHS) {
      expect(paths).not.toContain(forbidden);
      expect(paths.some((path) => path.startsWith(`${forbidden}/`))).toBe(
        false,
      );
    }
  });

  it("resolves every nav label in both locales", () => {
    for (const section of NAV_SECTIONS) {
      const sectionKey = section.labelKey as TranslationKey;
      expect(enTranslations[sectionKey]).toBeDefined();
      expect(arTranslations[sectionKey]).toBeDefined();
      for (const item of section.items) {
        const itemKey = item.labelKey as TranslationKey;
        expect(enTranslations[itemKey]).toBeDefined();
        expect(arTranslations[itemKey]).toBeDefined();
      }
    }
  });
});
