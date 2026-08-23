import { z } from "zod";

import {
  analyticsDurationMetricSchema,
  analyticsPeriodEnvelopeFields,
} from "./location-analytics-common.js";

export const operationalAnalyticsMetricsSchema = z
  .object({
    checkInTime: analyticsDurationMetricSchema,
    parkingTime: analyticsDurationMetricSchema,
    retrievalWait: analyticsDurationMetricSchema,
    retrievalStartLatencyAuxiliary: analyticsDurationMetricSchema,
    handoffTime: analyticsDurationMetricSchema,
  })
  .strict();
export type OperationalAnalyticsMetrics = z.infer<
  typeof operationalAnalyticsMetricsSchema
>;

export const carsHandledDayEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    handledCount: z.number().int().min(0),
  })
  .strict();

export const operationalAnalyticsResponseSchema = z
  .object({
    ...analyticsPeriodEnvelopeFields,
    metrics: operationalAnalyticsMetricsSchema,
    carsHandledPerDay: z.array(carsHandledDayEntrySchema),
  })
  .strict();
export type OperationalAnalyticsResponse = z.infer<
  typeof operationalAnalyticsResponseSchema
>;

export const queueSnapshotResponseSchema = z
  .object({
    depth: z.number().int().min(0),
    oldestAgeSeconds: z.string().regex(/^\d+\.\d{3}$/).nullable(),
  })
  .strict();
export type QueueSnapshotResponse = z.infer<typeof queueSnapshotResponseSchema>;
