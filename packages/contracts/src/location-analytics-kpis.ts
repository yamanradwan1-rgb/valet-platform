import { z } from "zod";

import { analyticsPeriodEnvelopeFields } from "./location-analytics-common.js";

const uuidSchema = z.string().uuid();
const percentageSchema = z.string().regex(/^\d+\.\d{2}$/);
const ratioSchema = z.string().regex(/^\d+\.\d{3}$/);

export const keyExceptionTypeSchema = z.enum([
  "KEY_MISSING",
  "WRONG_KEY",
  "KEY_DAMAGED",
  "KEY_LOCKED_INSIDE",
]);
export type KeyExceptionType = z.infer<typeof keyExceptionTypeSchema>;

const keyExceptionTypeCountSchema = z
  .object({
    count: z.number().int().min(0),
    type: keyExceptionTypeSchema,
  })
  .strict();

const handoffEmployeeCountSchema = z
  .object({
    count: z.number().int().min(1),
    membershipId: uuidSchema,
  })
  .strict();

export const locationKpiAnalyticsResponseSchema = z
  .object({
    ...analyticsPeriodEnvelopeFields,
    slaCompliance: z
      .object({
        denominator: z.number().int().min(0),
        invalidOrMissingIntervalCount: z.number().int().min(0),
        missingTargetCount: z.number().int().min(0),
        numerator: z.number().int().min(0),
        percentage: percentageSchema.nullable(),
      })
      .strict(),
    carsPerActiveEmployee: z
      .object({
        denominator: z.number().int().min(0),
        numerator: z.number().int().min(0),
        value: ratioSchema.nullable(),
      })
      .strict(),
    carsHandedOffByEmployee: z
      .object({
        attributedCount: z.number().int().min(0),
        employeeCount: z.number().int().min(0),
        missingAttributionCount: z.number().int().min(0),
        truncated: z.boolean(),
        byEmployee: z.array(handoffEmployeeCountSchema).max(500),
      })
      .strict(),
    keyExceptions: z
      .object({
        count: z.number().int().min(0),
        byType: z.array(keyExceptionTypeCountSchema).length(4),
      })
      .strict(),
  })
  .strict();

export type LocationKpiAnalyticsResponse = z.infer<
  typeof locationKpiAnalyticsResponseSchema
>;
