import { z } from "zod";

export const guestRatingValueSchema = z.number().int().min(1).max(5);

export const guestRatingSubmissionRequestSchema = z
  .object({ rating: guestRatingValueSchema })
  .strict();

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
export type GuestRatingSubmissionResponse = z.infer<
  typeof guestRatingSubmissionResponseSchema
>;
