import { z } from "zod";
import { analyticsPeriodQuerySchema } from "./location-analytics-common.js";

/**
 * Exactly two existing rating GETs may opt in. All other analytics routes
 * continue using analyticsPeriodQuerySchema without widening.
 */
export const ratingFeedbackOptInQuerySchema =
  analyticsPeriodQuerySchema.extend({
    includeComments: z.literal("true"),
  });

export const ratingFeedbackReadQuerySchema = z.union([
  analyticsPeriodQuerySchema,
  ratingFeedbackOptInQuerySchema,
]);

export type RatingFeedbackOptInQuery = z.infer<
  typeof ratingFeedbackOptInQuerySchema
>;
export type RatingFeedbackReadQuery = z.infer<
  typeof ratingFeedbackReadQuerySchema
>;
