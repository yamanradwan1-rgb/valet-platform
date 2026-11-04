import { describe, expect, it } from "vitest";
import {
  managementAlertCategoryProfiles,
  managementAlertDeferredCategoryId,
  managementAlertInScopeCategoryIds,
  managementAlertInScopeCategorySchema,
  managementAlertPhaseOneCategoryIds,
  managementAlertPhaseThreeCategoryIds,
  managementAlertPhaseTwoCategoryIds,
} from "./management-alert-category-inventory";
import { managementAlertPhaseOneCategorySchema } from "./management-alert-preview";

describe("Issue 414 Phase 2/3 selected-category inventory", () => {
  it("contains five previous categories, five Phase 2 and six Phase 3", () => {
    expect(managementAlertPhaseOneCategoryIds).toHaveLength(5);
    expect(managementAlertPhaseTwoCategoryIds).toHaveLength(5);
    expect(managementAlertPhaseThreeCategoryIds).toHaveLength(6);
    expect(new Set(managementAlertInScopeCategoryIds).size).toBe(16);
    expect(Object.keys(managementAlertCategoryProfiles).sort()).toEqual(
      [...managementAlertInScopeCategoryIds].sort(),
    );
  });

  it("keeps ALT-14 external and excluded from every enabled candidate", () => {
    expect(managementAlertDeferredCategoryId).toBe("ALT-14");
    expect(managementAlertInScopeCategorySchema.safeParse("ALT-14").success).toBe(
      false,
    );
    for (const category of managementAlertInScopeCategoryIds) {
      expect(managementAlertInScopeCategorySchema.safeParse(category).success).toBe(
        true,
      );
    }
  });

  it("does not widen the deployed Phase 1 preview category schema", () => {
    for (const category of managementAlertPhaseOneCategoryIds) {
      expect(managementAlertPhaseOneCategorySchema.safeParse(category).success).toBe(
        true,
      );
    }
    for (const category of [
      ...managementAlertPhaseTwoCategoryIds,
      ...managementAlertPhaseThreeCategoryIds,
    ]) {
      expect(managementAlertPhaseOneCategorySchema.safeParse(category).success).toBe(
        false,
      );
    }
  });

  it("distinguishes active cases from durable occurrences and two severities", () => {
    const occurrences = ["ALT-05", "ALT-07", "ALT-09", "ALT-13", "ALT-15"];
    const critical = ["ALT-01", "ALT-05", "ALT-07", "ALT-09"];
    for (const category of managementAlertInScopeCategoryIds) {
      const profile = managementAlertCategoryProfiles[category];
      expect(profile.caseKind).toBe(
        occurrences.includes(category) ? "OCCURRENCE" : "ACTIVE",
      );
      expect(profile.severities).toEqual(
        category === "ALT-08"
          ? ["IMPORTANT", "CRITICAL"]
          : [critical.includes(category) ? "CRITICAL" : "IMPORTANT"],
      );
    }
  });
});
