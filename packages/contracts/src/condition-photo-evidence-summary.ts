import { z } from "zod";

import {
  conditionPhotoOperationIdSchema,
  conditionPhotoValetSessionIdSchema,
  conditionPhotoVehiclePhotoIdSchema,
} from "./condition-photo-upload.js";

/** Actor-visible, immutable evidence metadata. Photo bytes and object keys never leave the API. */
export const conditionPhotoEvidenceSummarySchema = z.object({
  valetSessionId: conditionPhotoValetSessionIdSchema,
  verifiedTotal: z.number().int().min(0).max(10),
  latestVerified: z.array(z.object({
    operationId: conditionPhotoOperationIdSchema,
    vehiclePhotoId: conditionPhotoVehiclePhotoIdSchema,
    verifiedAt: z.string().datetime({ offset: false }).regex(/Z$/),
    status: z.literal("VERIFIED"),
  }).strict()).max(4),
}).strict().superRefine((value, context) => {
  if (value.latestVerified.length > value.verifiedTotal)
    context.addIssue({ code: "custom", path: ["verifiedTotal"],
      message: "Visible verified records cannot exceed the actor's verified total." });
  const evidence = new Set(value.latestVerified.map((item) => item.vehiclePhotoId));
  const operations = new Set(value.latestVerified.map((item) => item.operationId));
  if (evidence.size !== value.latestVerified.length ||
      operations.size !== value.latestVerified.length)
    context.addIssue({ code: "custom", path: ["latestVerified"],
      message: "Verified evidence identities must be distinct." });
  for (let i = 1; i < value.latestVerified.length; i += 1) {
    const previous = value.latestVerified[i - 1]!;
    const current = value.latestVerified[i]!;
    if (previous.verifiedAt < current.verifiedAt ||
        (previous.verifiedAt === current.verifiedAt &&
          previous.operationId < current.operationId))
      context.addIssue({ code: "custom", path: ["latestVerified", i],
        message: "Verified evidence must be newest first with a stable tie break." });
  }
});

export type ConditionPhotoEvidenceSummary = z.infer<
  typeof conditionPhotoEvidenceSummarySchema
>;
