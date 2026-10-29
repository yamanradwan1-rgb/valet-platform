import { z } from "zod";

import {
  carsHandledDayEntrySchema,
  operationalAnalyticsMetricsSchema,
} from "./location-analytics-operational.js";
import {
  cashReconciliationEntrySchema,
  financialAnalyticsCurrencyGroupSchema,
} from "./location-analytics-financial.js";
import {
  incidentSeverityCountEntrySchema,
  incidentTypeCountEntrySchema,
} from "./location-analytics-incidents.js";
import { reportKindSchema } from "./location-report-common.js";

const uuidSchema = z.string().uuid();
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timezoneSchema = z.string().min(1).max(64);

export const dispatchEventTypeSchema = z.enum([
  "QUEUED",
  "ASSIGNED",
  "ACCEPTED",
  "DECLINED",
  "REASSIGNED",
  "EMERGENCY_TAKEOVER",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export const keyCustodyEventTypeSchema = z.enum([
  "SLOT_ASSIGNED",
  "CHECKED_OUT",
  "RETURNED_TO_SLOT",
  "SLOT_CLEARED",
  "RELEASED",
]);
export const reportTaskTypeSchema = z.enum(["PARKING", "RETRIEVAL"]);

export const reportIncidentSummarySchema = z
  .object({
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

export const reportSummarySchema = z
  .object({
    metrics: operationalAnalyticsMetricsSchema,
    carsHandledPerDay: z.array(carsHandledDayEntrySchema),
    currencies: z.array(financialAnalyticsCurrencyGroupSchema),
    cashReconciliation: z.array(cashReconciliationEntrySchema),
    incidents: reportIncidentSummarySchema,
  })
  .strict();
export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const dailyActivitySchema = z
  .object({
    retrievalRequestedCount: z.number().int().min(0),
    dispatchEventCounts: z.array(
      z
        .object({
          taskType: reportTaskTypeSchema,
          eventType: dispatchEventTypeSchema,
          count: z.number().int().min(0),
        })
        .strict(),
    ),
    keyCustodyEventCounts: z.array(
      z
        .object({
          eventType: keyCustodyEventTypeSchema,
          count: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();
export type DailyActivity = z.infer<typeof dailyActivitySchema>;

const envelopeFields = {
  locationId: uuidSchema,
  timezone: timezoneSchema,
  kind: reportKindSchema,
  periodFrom: localDateSchema,
  periodTo: localDateSchema,
} as const;

export const dailyReportResponseSchema = z
  .object({
    ...envelopeFields,
    kind: z.literal("DAILY"),
    summary: reportSummarySchema,
    dailyActivity: dailyActivitySchema,
  })
  .strict();
export type DailyReportResponse = z.infer<typeof dailyReportResponseSchema>;

export const periodicReportResponseSchema = z
  .object({
    ...envelopeFields,
    summary: reportSummarySchema,
  })
  .strict();
export type PeriodicReportResponse = z.infer<
  typeof periodicReportResponseSchema
>;
