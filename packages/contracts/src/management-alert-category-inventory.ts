import { z } from "zod";

/**
 * Issue #414's selected category inventory is not an enablement switch.
 * Phase 2/3 source authorization, Seen and rollout remain gated by OD-07/08.
 * The Phase-1 preview schema deliberately remains unchanged.
 */
export const managementAlertPhaseTwoCategoryIds = [
  "ALT-04",
  "ALT-05",
  "ALT-06",
  "ALT-07",
  "ALT-09",
] as const;

export const managementAlertPhaseThreeCategoryIds = [
  "ALT-10",
  "ALT-11",
  "ALT-13",
  "ALT-15",
  "ALT-16",
  "ALT-17",
] as const;

export const managementAlertPhaseOneCategoryIds = [
  "ALT-01",
  "ALT-02",
  "ALT-03",
  "ALT-08",
  "ALT-12",
] as const;

/** ALT-14 has no authoritative cash-reconciliation retirement source. */
export const managementAlertDeferredCategoryId = "ALT-14" as const;

export const managementAlertInScopeCategoryIds = [
  ...managementAlertPhaseOneCategoryIds,
  ...managementAlertPhaseTwoCategoryIds,
  ...managementAlertPhaseThreeCategoryIds,
] as const;

/** Contract-only; NOT permission to return any new category from a preview. */
export const managementAlertInScopeCategorySchema = z.enum(
  managementAlertInScopeCategoryIds,
);

type CategoryProfile = Readonly<{
  phase: 1 | 2 | 3;
  caseKind: "ACTIVE" | "OCCURRENCE";
  severities: readonly ("IMPORTANT" | "CRITICAL")[];
}>;

/** Source identity, audience, detail and Seen contracts are deliberately absent. */
export const managementAlertCategoryProfiles = {
  "ALT-01": { phase: 1, caseKind: "ACTIVE", severities: ["CRITICAL"] },
  "ALT-02": { phase: 1, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
  "ALT-03": { phase: 1, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
  "ALT-04": { phase: 2, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
  "ALT-05": { phase: 2, caseKind: "OCCURRENCE", severities: ["CRITICAL"] },
  "ALT-06": { phase: 2, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
  "ALT-07": { phase: 2, caseKind: "OCCURRENCE", severities: ["CRITICAL"] },
  "ALT-08": {
    phase: 1,
    caseKind: "ACTIVE",
    severities: ["IMPORTANT", "CRITICAL"],
  },
  "ALT-09": { phase: 2, caseKind: "OCCURRENCE", severities: ["CRITICAL"] },
  "ALT-10": { phase: 3, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
  "ALT-11": { phase: 3, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
  "ALT-12": { phase: 1, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
  "ALT-13": { phase: 3, caseKind: "OCCURRENCE", severities: ["IMPORTANT"] },
  "ALT-15": { phase: 3, caseKind: "OCCURRENCE", severities: ["IMPORTANT"] },
  "ALT-16": { phase: 3, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
  "ALT-17": { phase: 3, caseKind: "ACTIVE", severities: ["IMPORTANT"] },
} as const satisfies Record<
  (typeof managementAlertInScopeCategoryIds)[number],
  CategoryProfile
>;

export type ManagementAlertInScopeCategory =
  (typeof managementAlertInScopeCategoryIds)[number];
