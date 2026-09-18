import { z } from "zod";

import { companyAnalyticsSummarySchema } from "./company-analytics.js";
import {
  dispatchEventTypeSchema,
  keyCustodyEventTypeSchema,
  reportTaskTypeSchema,
} from "./location-report.js";
import {
  dailyReportQuerySchema,
  monthlyReportQuerySchema,
  reportExportRequestSchema,
  weeklyReportQuerySchema,
  type ReportExportRequest,
} from "./location-report-common.js";

const uuidSchema = z.string().uuid();
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const companyDailyReportQuerySchema = dailyReportQuerySchema;
export const companyWeeklyReportQuerySchema = weeklyReportQuerySchema;
export const companyMonthlyReportQuerySchema = monthlyReportQuerySchema;
export const companyReportExportRequestSchema = reportExportRequestSchema;
export type CompanyReportExportRequest = ReportExportRequest;

export const companyDailyActivitySchema = z
  .object({
    retrievalRequestedCount: z.number().int().min(0),
    dispatchEventCounts: z
      .array(
        z
          .object({
            taskType: reportTaskTypeSchema,
            eventType: dispatchEventTypeSchema,
            count: z.number().int().min(0),
          })
          .strict(),
      )
      .max(16),
    keyCustodyEventCounts: z
      .array(
        z
          .object({
            eventType: keyCustodyEventTypeSchema,
            count: z.number().int().min(0),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

const companyReportEnvelopeFields = {
  organizationId: uuidSchema,
  periodFrom: localDateSchema,
  periodTo: localDateSchema,
  summary: companyAnalyticsSummarySchema,
} as const;

export const companyDailyReportResponseSchema = z
  .object({
    ...companyReportEnvelopeFields,
    kind: z.literal("DAILY"),
    dailyActivity: companyDailyActivitySchema,
  })
  .strict();

export const companyPeriodicReportResponseSchema = z
  .object({
    ...companyReportEnvelopeFields,
    kind: z.enum(["WEEKLY", "MONTHLY"]),
  })
  .strict();

export const companyReportResponseSchema = z.union([
  companyDailyReportResponseSchema,
  companyPeriodicReportResponseSchema,
]);

export type CompanyDailyReportResponse = z.infer<typeof companyDailyReportResponseSchema>;
export type CompanyPeriodicReportResponse = z.infer<typeof companyPeriodicReportResponseSchema>;
export type CompanyReportResponse = z.infer<typeof companyReportResponseSchema>;
