import { z } from "zod";

import { analyticsPeriodEnvelopeFields } from "./location-analytics-common.js";

export const incidentSeverityCountEntrySchema = z
  .object({
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    count: z.number().int().min(0),
  })
  .strict();

export const incidentTypeCountEntrySchema = z
  .object({
    type: z.string(),
    count: z.number().int().min(0),
  })
  .strict();

export const incidentAnalyticsResponseSchema = z
  .object({
    ...analyticsPeriodEnvelopeFields,
    incidentCount: z.number().int().min(0),
    severityCounts: z.array(incidentSeverityCountEntrySchema),
    typeCounts: z.array(incidentTypeCountEntrySchema),
    incidentsPer1000: z.object({
      numerator: z.number().int().min(0),
      denominator: z.number().int().min(0),
      value: z.string().regex(/^\d+\.\d{3}$/).nullable(),
    }),
  })
  .strict();
export type IncidentAnalyticsResponse = z.infer<
  typeof incidentAnalyticsResponseSchema
>;
