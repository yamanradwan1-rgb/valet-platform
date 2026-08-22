import { z } from "zod";

const uuidSchema = z.string().uuid();
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timezoneSchema = z.string().min(1).max(64);

export const analyticsPeriodQuerySchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
  })
  .strict();
export type AnalyticsPeriodQuery = z.infer<typeof analyticsPeriodQuerySchema>;

export const analyticsPeriodEnvelopeFields = {
  locationId: uuidSchema,
  timezone: timezoneSchema,
  from: localDateSchema,
  to: localDateSchema,
} as const;

export const analyticsDurationMetricSchema = z
  .object({
    sampleCount: z.number().int().min(0),
    averageSeconds: z.string().regex(/^\d+\.\d{3}$/).nullable(),
  })
  .strict();
export type AnalyticsDurationMetric = z.infer<
  typeof analyticsDurationMetricSchema
>;

export const analyticsRateSchema = z
  .object({
    numerator: z.number().int().min(0),
    denominator: z.number().int().min(0),
    percentage: z.string().regex(/^\d+\.\d{2}$/).nullable(),
  })
  .strict();
export type AnalyticsRate = z.infer<typeof analyticsRateSchema>;
