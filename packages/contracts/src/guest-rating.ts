import { z } from "zod";
import {
  canonicalizeGuestRatingComment,
  isValidGuestRatingComment,
} from "./guest-rating-comment.js";

export const guestRatingValueSchema = z.number().int().min(1).max(5);

export const guestRatingSubmissionRequestSchema = z
  .object({ rating: guestRatingValueSchema })
  .strict();

export const guestRatingScopedFeedbackRequestSchema = z.object({
  rating: guestRatingValueSchema,
  expectedValetSessionId: z.string().uuid(),
  comment: z.union([
    z.string()
      .refine(isValidGuestRatingComment, "Invalid Guest rating comment.")
      .transform(canonicalizeGuestRatingComment),
    z.null(),
  ]).optional(),
}).strict();

/** Explicit new-entry parser. The legacy export above remains exactly strict. */
export const guestRatingSubmissionUnionSchema = z.union([
  guestRatingSubmissionRequestSchema,
  guestRatingScopedFeedbackRequestSchema,
]);

export const guestRatingSubmissionResponseSchema = z
  .object({
    rating: guestRatingValueSchema,
    ratedAt: z.string().datetime({ offset: true }),
    valetSessionId: z.string().uuid(),
  })
  .strict();

export type GuestRatingSubmissionRequest = z.infer<
  typeof guestRatingSubmissionRequestSchema
>;
export type GuestRatingScopedFeedbackRequest = z.infer<
  typeof guestRatingScopedFeedbackRequestSchema
>;
export type GuestRatingSubmissionUnionRequest = z.infer<
  typeof guestRatingSubmissionUnionSchema
>;
export type GuestRatingSubmissionResponse = z.infer<
  typeof guestRatingSubmissionResponseSchema
>;
