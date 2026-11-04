import { z } from "zod";
import {
  managementAlertCategoryProfiles,
  managementAlertInScopeCategorySchema,
} from "./management-alert-category-inventory";
import {
  managementAlertSeveritySchema,
  managementAlertPreviewResponseSchema,
} from "./management-alert-preview";

/**
 * Additive contract for the eventual 16-category aggregate.
 *
 * This does not activate any category. The Phase-1 response schema is left
 * unchanged and remains the default until a separately gated rollout.
 */
const sourceKind = z.enum([
  "RETRIEVAL",
  "TASK",
  "INCIDENT",
  "PRESENCE",
  "TAKEOVER",
  "HANDOFF",
  "GEOFENCE",
  "PAYMENT",
  "SHIFT",
  "STAFF",
  "LOCATION",
  "SUBSCRIPTION",
]);

export const managementAlertUnifiedSourceKinds = {
  "ALT-01": "RETRIEVAL",
  "ALT-02": "TASK",
  "ALT-03": "TASK",
  "ALT-04": "TASK",
  "ALT-05": "TAKEOVER",
  "ALT-06": "RETRIEVAL",
  "ALT-07": "HANDOFF",
  "ALT-08": "INCIDENT",
  "ALT-09": "GEOFENCE",
  "ALT-10": "PAYMENT",
  "ALT-11": "PAYMENT",
  "ALT-12": "PRESENCE",
  "ALT-13": "SHIFT",
  "ALT-15": "STAFF",
  "ALT-16": "LOCATION",
  "ALT-17": "SUBSCRIPTION",
} as const;

const common = z.object({
  id: z.string().min(1).max(260),
  category: managementAlertInScopeCategorySchema,
  severity: managementAlertSeveritySchema,
  sourceKind,
  sourceId: z.string().uuid(),
  episodeId: z.string().min(1).max(150),
  /** Null is reserved for the two CA-only Organization-wide categories. */
  locationId: z.string().uuid().nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  title: z.string().min(1).max(100),
});

export const managementAlertUnifiedItemSchema = z
  .discriminatedUnion("caseKind", [
    common.extend({ caseKind: z.literal("ACTIVE") }).strict(),
    common
      .extend({
        caseKind: z.literal("OCCURRENCE"),
        seen: z.literal(false),
        /** Only eligible unseen occurrences are included in attention preview. */
        seenEligible: z.literal(true),
      })
      .strict(),
  ])
  .superRefine((item, context) => {
    const profile = managementAlertCategoryProfiles[item.category];
    if (profile.caseKind !== item.caseKind) {
      context.addIssue({
        code: "custom",
        path: ["caseKind"],
        message: "Category is not eligible for the supplied case kind",
      });
    }
    if (!profile.severities.some((allowed) => allowed === item.severity)) {
      context.addIssue({
        code: "custom",
        path: ["severity"],
        message: "Invalid category severity",
      });
    }
    if (managementAlertUnifiedSourceKinds[item.category] !== item.sourceKind) {
      context.addIssue({
        code: "custom",
        path: ["sourceKind"],
        message: "Invalid category source kind",
      });
    }
    const organizationOnly =
      item.category === "ALT-15" || item.category === "ALT-17";
    if ((item.locationId === null) !== organizationOnly) {
      context.addIssue({
        code: "custom",
        path: ["locationId"],
        message: "Invalid category scope",
      });
    }
  });

export const managementAlertUnifiedPreviewResponseSchema = z
  .object({
    items: z.array(managementAlertUnifiedItemSchema).max(20),
    count: z.number().int().min(0).max(20),
    hasMore: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.count !== result.items.length) {
      context.addIssue({
        code: "custom",
        path: ["count"],
        message: "Count must equal the eligible authorized preview length",
      });
    }
    if (result.hasMore && result.items.length !== 20) {
      context.addIssue({
        code: "custom",
        path: ["hasMore"],
        message: "Overflow requires 20 visible authorized cases",
      });
    }
  });

export const managementAlertUnifiedSourceDetailResponseSchema = z
  .object({
    item: managementAlertUnifiedItemSchema,
    valetSessionId: z.string().uuid().nullable(),
  })
  .strict();

/** Explicit compile-time reminder that the legacy runtime payload is separate. */
export const managementAlertPhaseOneRuntimeSchema =
  managementAlertPreviewResponseSchema;

export type ManagementAlertUnifiedItem = z.infer<
  typeof managementAlertUnifiedItemSchema
>;
export type ManagementAlertUnifiedPreviewResponse = z.infer<
  typeof managementAlertUnifiedPreviewResponseSchema
>;
