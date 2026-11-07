import { z } from "zod";
import { utf16StringMax } from "./utf16-string-max.js";

/** Phase 1 only. Later categories are deliberately absent from the runtime DTO. */
export const managementAlertPhaseOneCategorySchema = z.enum([
  "ALT-01",
  "ALT-02",
  "ALT-03",
  "ALT-08",
  "ALT-12",
]);

export const managementAlertSeveritySchema = z.enum(["CRITICAL", "IMPORTANT"]);

export const managementAlertSourceKindSchema = z.enum([
  "RETRIEVAL",
  "TASK",
  "INCIDENT",
  "PRESENCE",
]);

export const managementAlertPreviewItemSchema = z
  .object({
    id: z.string().min(1).max(260).superRefine(utf16StringMax(260)),
    category: managementAlertPhaseOneCategorySchema,
    severity: managementAlertSeveritySchema,
    sourceKind: managementAlertSourceKindSchema,
    sourceId: z.string().uuid(),
    episodeId: z.string().min(1).max(150).superRefine(utf16StringMax(150)),
    locationId: z.string().uuid(),
    occurredAt: z.string().datetime({ offset: true }),
    title: z.string().min(1).max(100).superRefine(utf16StringMax(100)),
  })
  .strict()
  .superRefine((item, context) => {
    const requiredKind = {
      "ALT-01": "RETRIEVAL",
      "ALT-02": "TASK",
      "ALT-03": "TASK",
      "ALT-08": "INCIDENT",
      "ALT-12": "PRESENCE",
    }[item.category];
    if (item.sourceKind !== requiredKind) {
      context.addIssue({
        code: "custom",
        path: ["sourceKind"],
        message: "Invalid alert source kind",
      });
    }
    if (item.category !== "ALT-08") {
      const requiredLevel =
        item.category === "ALT-01" ? "CRITICAL" : "IMPORTANT";
      if (item.severity !== requiredLevel) {
        context.addIssue({
          code: "custom",
          path: ["severity"],
          message: "Invalid alert priority",
        });
      }
    }
  });

export const managementAlertPreviewResponseSchema = z
  .object({
    items: z.array(managementAlertPreviewItemSchema).max(20),
    /** Capped count: a true overflow is represented by hasMore, never a guess. */
    count: z.number().int().min(0).max(20),
    hasMore: z.boolean(),
  })
  .strict()
  .refine((value) => value.count === value.items.length, {
    message: "Alert badge count must match the authorized preview",
  });

/** A fresh, source-authorized exact read; no raw Incident or Presence material. */
export const managementAlertSourceDetailResponseSchema = z
  .object({
    item: managementAlertPreviewItemSchema,
    valetSessionId: z.string().uuid().nullable(),
  })
  .strict();

export type ManagementAlertPreviewItem = z.infer<
  typeof managementAlertPreviewItemSchema
>;
export type ManagementAlertPreviewResponse = z.infer<
  typeof managementAlertPreviewResponseSchema
>;
export type ManagementAlertSourceDetailResponse = z.infer<
  typeof managementAlertSourceDetailResponseSchema
>;
