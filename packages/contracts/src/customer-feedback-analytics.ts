import { z } from "zod";

const nonNegativeCount = z.number().int().nonnegative().safe();
const decimalFour = z.string().regex(/^\d+\.\d{4}$/);
const decimalSix = z.string().regex(/^\d+\.\d{6}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const utcInstant = z.string().datetime({ offset: false });

export const customerFeedbackRatingRowSchema = z.object({
  visitReference: z.string().regex(/^VISIT-[0-9A-F]{12}$/),
  rating: z.number().int().min(1).max(5),
  completedAt: utcInstant,
  ratedAt: utcInstant,
  authorizedLocationLabel: z.string().min(1).max(200),
  locationTimezone: z.string().min(1).max(64),
}).strict();

export const customerFeedbackAnalyticsResponseSchema = z.object({
  scope: z.enum(["COMPANY", "LOCATION"]),
  from: date,
  to: date,
  eligibleCompletedVisits: nonNegativeCount,
  ratedVisits: nonNegativeCount,
  averageRating: decimalFour.nullable(),
  participationRate: decimalSix.nullable(),
  distribution: z.object({
    five: nonNegativeCount,
    four: nonNegativeCount,
    three: nonNegativeCount,
    two: nonNegativeCount,
    one: nonNegativeCount,
  }).strict(),
  recentRatings: z.array(customerFeedbackRatingRowSchema).max(4),
}).strict().superRefine((value, context) => {
  const issue = (message: string) => {
    context.addIssue({ code: "custom", message });
  };
  const rated = value.ratedVisits;
  const eligible = value.eligibleCompletedVisits;
  if (rated > eligible) issue("Rated visits cannot exceed eligible visits.");
  if (Object.values(value.distribution).reduce((a, b) => a + b, 0) !== rated) {
    issue("The rating buckets must sum to rated visits.");
  }
  if (value.recentRatings.length > rated) issue("Recent rows exceed rated visits.");
  if ((rated === 0) !== (value.averageRating === null)) {
    issue("Average rating nullability must match rated visits.");
  }
  if ((eligible === 0) !== (value.participationRate === null)) {
    issue("Participation nullability must match eligible visits.");
  }
  if (value.averageRating !== null) {
    const average = Number(value.averageRating);
    if (!Number.isFinite(average) || average < 1 || average > 5) {
      issue("Average rating must be between one and five.");
    }
  }
  if (value.participationRate !== null) {
    const rate = Number(value.participationRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1 ||
        Math.abs(rate - rated / eligible) > 0.00000051) {
      issue("Participation ratio does not match the visits cohort.");
    }
  }
});

export type CustomerFeedbackAnalyticsResponse = z.infer<
  typeof customerFeedbackAnalyticsResponseSchema
>;
