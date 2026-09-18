import { z } from "zod";

import { analyticsPeriodQuerySchema } from "./location-analytics-common.js";
import {
  cashReconciliationEntrySchema,
  financialAnalyticsCurrencyGroupSchema,
} from "./location-analytics-financial.js";
import {
  incidentSeverityCountEntrySchema,
  incidentTypeCountEntrySchema,
} from "./location-analytics-incidents.js";
import { keyExceptionTypeSchema } from "./location-analytics-kpis.js";
import { carsHandledDayEntrySchema } from "./location-analytics-operational.js";

const uuidSchema = z.string().uuid();
const timezoneSchema = z.string().min(1).max(64);
const utcTimestampSchema = z.string().datetime({ offset: false });
const percentageSchema = z.string().regex(/^\d+\.\d{2}$/);
const ratioSchema = z.string().regex(/^\d+\.\d{3}$/);

export const companyAnalyticsPeriodQuerySchema = analyticsPeriodQuerySchema;

export const companyTimezoneBoundarySchema = z
  .object({
    timezone: timezoneSchema,
    locationCount: z.number().int().min(0),
    activeLocationCount: z.number().int().min(0),
    inactiveLocationCount: z.number().int().min(0),
    periodStartUtc: utcTimestampSchema,
    periodEndUtc: utcTimestampSchema,
  })
  .strict();

export const companyAnalyticsCoverageSchema = z
  .object({
    totalLocationCount: z.number().int().min(0),
    activeLocationCount: z.number().int().min(0),
    inactiveLocationCount: z.number().int().min(0),
    timezoneBoundaries: z.array(companyTimezoneBoundarySchema).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    for (let index = 1; index < value.timezoneBoundaries.length; index += 1) {
      if (value.timezoneBoundaries[index - 1]!.timezone >= value.timezoneBoundaries[index]!.timezone) {
        context.addIssue({ code: "custom", message: "Timezone boundaries must be deterministic." });
        break;
      }
    }
  });

export const companyDurationMetricSchema = z
  .object({
    sampleCount: z.number().int().min(0),
    averageSeconds: ratioSchema.nullable(),
    contributingLocationCount: z.number().int().min(0),
  })
  .strict();

export const companyOperationalAnalyticsSchema = z
  .object({
    metrics: z
      .object({
        checkInTime: companyDurationMetricSchema,
        parkingTime: companyDurationMetricSchema,
        retrievalWait: companyDurationMetricSchema,
        retrievalStartLatencyAuxiliary: companyDurationMetricSchema,
        handoffTime: companyDurationMetricSchema,
      })
      .strict(),
    carsHandledPerDay: z.array(carsHandledDayEntrySchema).max(31),
  })
  .strict();

export const companyFinancialAnalyticsSchema = z
  .object({
    currencies: z.array(financialAnalyticsCurrencyGroupSchema).max(500),
    cashReconciliation: z.array(cashReconciliationEntrySchema).max(500),
  })
  .strict();

export const companyIncidentAnalyticsSchema = z
  .object({
    incidentCount: z.number().int().min(0),
    severityCounts: z.array(incidentSeverityCountEntrySchema).max(4),
    typeCounts: z.array(incidentTypeCountEntrySchema).max(500),
    incidentsPer1000: z
      .object({
        numerator: z.number().int().min(0),
        denominator: z.number().int().min(0),
        value: ratioSchema.nullable(),
      })
      .strict(),
  })
  .strict();

export const companyKpiAnalyticsSchema = z
  .object({
    slaCompliance: z
      .object({
        numerator: z.number().int().min(0),
        denominator: z.number().int().min(0),
        percentage: percentageSchema.nullable(),
        missingTargetCount: z.number().int().min(0),
        invalidOrMissingIntervalCount: z.number().int().min(0),
        contributingLocationCount: z.number().int().min(0),
        requestCount: z.number().int().min(0),
      })
      .strict(),
    carsPerActiveEmployee: z
      .object({
        numerator: z.number().int().min(0),
        denominator: z.number().int().min(0),
        value: ratioSchema.nullable(),
        evidenceLocationCount: z.number().int().min(0),
      })
      .strict(),
    carsHandedOff: z
      .object({
        attributedCount: z.number().int().min(0),
        missingAttributionCount: z.number().int().min(0),
        distinctAttributedEmployeeCount: z.number().int().min(0),
      })
      .strict(),
    keyExceptions: z
      .object({
        count: z.number().int().min(0),
        byType: z
          .array(
            z
              .object({ count: z.number().int().min(0), type: keyExceptionTypeSchema })
              .strict(),
          )
          .length(4),
      })
      .strict(),
  })
  .strict();

export const companyAnalyticsSummarySchema = z
  .object({
    coverage: companyAnalyticsCoverageSchema,
    operational: companyOperationalAnalyticsSchema,
    financial: companyFinancialAnalyticsSchema,
    incidents: companyIncidentAnalyticsSchema,
    kpis: companyKpiAnalyticsSchema,
  })
  .strict();

export const companyAnalyticsResponseSchema = z
  .object({
    organizationId: uuidSchema,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    summary: companyAnalyticsSummarySchema,
  })
  .strict();

export type CompanyAnalyticsPeriodQuery = z.infer<typeof companyAnalyticsPeriodQuerySchema>;
export type CompanyAnalyticsSummary = z.infer<typeof companyAnalyticsSummarySchema>;
export type CompanyAnalyticsResponse = z.infer<typeof companyAnalyticsResponseSchema>;
