import { z } from "zod";

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const reportKindSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
export type ReportKind = z.infer<typeof reportKindSchema>;

export const exportFormatSchema = z.enum(["CSV", "PDF"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const dailyReportQuerySchema = z
  .object({ date: localDateSchema })
  .strict();
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;

export const weeklyReportQuerySchema = z
  .object({ weekStart: localDateSchema })
  .strict();
export type WeeklyReportQuery = z.infer<typeof weeklyReportQuerySchema>;

export const monthlyReportQuerySchema = z
  .object({ month: localMonthSchema })
  .strict();
export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;

export const reportExportRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("DAILY"),
      format: exportFormatSchema,
      date: localDateSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("WEEKLY"),
      format: exportFormatSchema,
      weekStart: localDateSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("MONTHLY"),
      format: exportFormatSchema,
      month: localMonthSchema,
    })
    .strict(),
]);
export type ReportExportRequest = z.infer<typeof reportExportRequestSchema>;
